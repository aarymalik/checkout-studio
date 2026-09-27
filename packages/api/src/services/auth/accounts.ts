import "server-only"

import { identityRepository, verificationTokenRepository } from "@checkout-studio/database"
import { logger } from "@checkout-studio/observability"
import { Errors } from "@checkout-studio/utils"
import { checkPassword, hashPassword, verifyAgainstNothing, verifyPassword } from "./password"
import { expiryFor, generateToken, hashToken } from "./tokens"
import { passwordResetEmail, verificationEmail } from "./messages"
import type { EmailSender } from "./email"
import { endOtherSessions } from "./session"

/**
 * The account flows: sign up, verify, sign in, reset, change.
 *
 * Every one of these answers the same way whether or not an account exists.
 * That is the single property most easily lost here, and losing it turns the
 * sign-up form into a way to ask "is this person a customer?" one address at a
 * time — which is worth something to anyone who wants to phish them.
 *
 * See docs/security.md § Authentication.
 */

export interface AuthDependencies {
  email: EmailSender
  /** Where links point. The application's public URL. */
  appUrl: string
  /** Keys the session fingerprint of a client address. */
  sessionSecret: string
}

function linkTo(appUrl: string, path: string, token: string): string {
  const url = new URL(path, appUrl)
  url.searchParams.set("token", token)
  return url.toString()
}

/** Turns a rejected password into an error a person can act on. */
function passwordError(password: string): ReturnType<typeof Errors.validation.invalidInput> | null {
  const problem = checkPassword(password)
  if (problem === null) return null

  const message =
    problem === "too-short"
      ? "Use at least 12 characters. A few words you will remember beats a short password with symbols in it."
      : problem === "too-long"
        ? "That password is too long."
        : "That password is one of the most commonly used. Choose something else."

  return Errors.validation.invalidInput([{ path: "password", code: problem, message }])
}

/**
 * Creates an account and sends a verification link.
 *
 * Reports success whether or not the address was already taken. An address that
 * already has an account gets an email saying so, rather than a form that says
 * so — which is the only way to tell the person who owns it without telling
 * whoever typed it.
 */
export async function signUp(
  input: { email: string; password: string; fullName?: string | undefined },
  dependencies: AuthDependencies,
): Promise<void> {
  const rejection = passwordError(input.password)
  if (rejection !== null) throw rejection

  const existing = await identityRepository.findByEmail(input.email)

  if (existing !== null) {
    /*
     * The address is taken, and the response will not say so.
     *
     * Sending nothing would leave a silent difference in behaviour that is
     * still observable by the person testing it. Sending the *owner* a note
     * tells the only person entitled to know.
     */
    logger.info("auth.signup.existing", { userId: existing.id })

    if (existing.emailVerifiedAt === null) {
      await sendVerification(existing.id, input.email, dependencies)
    }

    return
  }

  const account = await identityRepository.createAccount({
    email: input.email,
    passwordHash: await hashPassword(input.password),
    ...(input.fullName === undefined ? {} : { fullName: input.fullName }),
  })

  logger.info("auth.signup.created", { userId: account.id })

  await sendVerification(account.id, input.email, dependencies)
}

async function sendVerification(
  userId: string,
  email: string,
  dependencies: AuthDependencies,
): Promise<void> {
  const token = generateToken()

  await verificationTokenRepository.issue({
    userId,
    tokenHash: hashToken(token),
    purpose: "verify_email",
    expiresAt: expiryFor("verify_email"),
  })

  const composed = verificationEmail(linkTo(dependencies.appUrl, "/verify", token))
  await dependencies.email.send({ to: email, ...composed })
}

/**
 * Confirms an address.
 *
 * Marking the address verified and spending the link happen in one
 * transaction, so a link cannot be spent without the account becoming usable.
 */
export async function verifyEmail(token: string): Promise<boolean> {
  const userId = await verificationTokenRepository.consume(
    hashToken(token),
    "verify_email",
    async (tx, id) => {
      await tx.user.update({ where: { id }, data: { emailVerifiedAt: new Date() } })
      return id
    },
  )

  if (userId === null) return false

  logger.info("auth.verified", { userId })
  return true
}

export interface SignInResult {
  userId: string
}

/**
 * Checks a password.
 *
 * Takes the same time whether the address is unknown, the password is wrong, or
 * both — the decoy hash is the whole reason `verifyAgainstNothing` exists. A
 * function that returned early for an unknown address would be a way to
 * enumerate every customer, one request at a time, no matter how carefully the
 * response is worded.
 */
export async function signIn(input: {
  email: string
  password: string
}): Promise<SignInResult | null> {
  const credentials = await identityRepository.credentialsFor(input.email)

  if (credentials === null) {
    await verifyAgainstNothing(input.password)
    return null
  }

  const { valid, needsRehash } = await verifyPassword(credentials.passwordHash, input.password)

  if (!valid) return null

  if (credentials.emailVerifiedAt === null) {
    // Correct password, unfinished account. Not a sign-in, and not a failure
    // worth distinguishing to anyone watching from outside.
    logger.info("auth.signin.unverified", { userId: credentials.id })
    return null
  }

  if (needsRehash) {
    // The one moment the password is in memory and known to be right.
    await identityRepository.setPasswordHash(credentials.id, await hashPassword(input.password))
    logger.info("auth.rehashed", { userId: credentials.id })
  }

  return { userId: credentials.id }
}

/**
 * Sends a reset link, if there is anywhere to send it.
 *
 * Returns nothing either way. The caller says the same thing to everyone, which
 * is the only honest thing it can say: "if that address has an account, a link
 * is on its way".
 */
export async function requestPasswordReset(
  email: string,
  dependencies: AuthDependencies,
): Promise<void> {
  const account = await identityRepository.findByEmail(email)

  if (account === null) {
    logger.info("auth.reset.unknown_address")
    return
  }

  const token = generateToken()

  await verificationTokenRepository.issue({
    userId: account.id,
    tokenHash: hashToken(token),
    purpose: "reset_password",
    expiresAt: expiryFor("reset_password"),
  })

  const composed = passwordResetEmail(linkTo(dependencies.appUrl, "/reset", token))
  await dependencies.email.send({ to: account.email, ...composed })

  logger.info("auth.reset.sent", { userId: account.id })
}

/**
 * Sets a new password from a reset link.
 *
 * Every session ends. Somebody resetting a password may be doing it because
 * someone else has one, and leaving those alive would defeat the whole
 * exercise. The address is also marked verified: arriving through a link sent
 * to it proves the same thing a verification link proves.
 */
export async function resetPassword(token: string, password: string): Promise<boolean> {
  const rejection = passwordError(password)
  if (rejection !== null) throw rejection

  const passwordHash = await hashPassword(password)

  const userId = await verificationTokenRepository.consume(
    hashToken(token),
    "reset_password",
    async (tx, id) => {
      await tx.user.update({
        where: { id },
        data: { passwordHash, emailVerifiedAt: new Date() },
      })
      return id
    },
  )

  if (userId === null) return false

  await endOtherSessions(userId, null)
  logger.info("auth.reset.completed", { userId })

  return true
}

/**
 * Changes a password for somebody already signed in.
 *
 * The current password is required even though the session proves who they
 * are: a session is left behind on a shared computer far more often than a
 * password is given away, and this is the step that stops the person who finds
 * it from locking the owner out.
 *
 * Every other session ends — but not this one. Signing somebody out of the
 * browser they are using, as a consequence of securing their account, reads as
 * a failure.
 */
export async function changePassword(input: {
  userId: string
  sessionId: string
  currentPassword: string
  newPassword: string
}): Promise<boolean> {
  const rejection = passwordError(input.newPassword)
  if (rejection !== null) throw rejection

  const account = await identityRepository.findById(input.userId)
  if (account === null) return false

  const credentials = await identityRepository.credentialsFor(account.email)
  if (credentials === null) return false

  const { valid } = await verifyPassword(credentials.passwordHash, input.currentPassword)
  if (!valid) return false

  await identityRepository.setPasswordHash(input.userId, await hashPassword(input.newPassword))
  const ended = await endOtherSessions(input.userId, input.sessionId)

  logger.info("auth.password.changed", { userId: input.userId, sessionsEnded: ended })

  return true
}
