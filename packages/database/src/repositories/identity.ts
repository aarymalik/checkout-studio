import "server-only"

import { prisma } from "../client"

/**
 * Accounts, sessions and one-time tokens.
 *
 * The one repository that takes no TenantContext, and the reason is worth
 * stating: every other repository scopes to the authenticated user, and these
 * queries run *before* there is one. A sign-in cannot be scoped by the person
 * it is about to identify.
 *
 * That makes this the sharpest edge in the data layer. Every method here is
 * therefore narrow on purpose — it answers one question about one account, and
 * none of them takes a filter a caller could widen.
 *
 * See docs/database.md and docs/security.md.
 */

export type VerificationPurpose = "verify_email" | "reset_password"

/**
 * An account, without its password hash.
 *
 * The hash is read by exactly one method, which returns it to the one caller
 * that compares it. Keeping it out of the shape everything else uses means it
 * cannot be logged, serialised into a response, or swept into an export by
 * accident — the absence is the safeguard.
 */
const PUBLIC_FIELDS = {
  id: true,
  email: true,
  emailVerifiedAt: true,
  fullName: true,
  avatarUrl: true,
  platformRole: true,
  createdAt: true,
  updatedAt: true,
} as const

export interface CreateAccountInput {
  email: string
  passwordHash: string
  fullName?: string
}

/** Addresses are stored and compared lowercased: one address is one account. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export const identityRepository = {
  async findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
      select: PUBLIC_FIELDS,
    })
  },

  async findById(id: string) {
    return prisma.user.findUnique({ where: { id }, select: PUBLIC_FIELDS })
  },

  /**
   * The stored hash, for the one function that compares it.
   *
   * Returns the id alongside so the caller never has to fetch the account
   * twice, and nothing else: a method that returned the whole account with its
   * hash attached would be the convenient thing to reach for everywhere.
   */
  async credentialsFor(email: string) {
    return prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
      select: { id: true, passwordHash: true, emailVerifiedAt: true },
    })
  },

  async createAccount(input: CreateAccountInput) {
    return prisma.user.create({
      data: {
        email: normalizeEmail(input.email),
        passwordHash: input.passwordHash,
        ...(input.fullName === undefined ? {} : { fullName: input.fullName }),
      },
      select: PUBLIC_FIELDS,
    })
  },

  async setPasswordHash(userId: string, passwordHash: string) {
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } })
  },

  async markEmailVerified(userId: string) {
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    })
  },
}

export interface CreateSessionInput {
  userId: string
  tokenHash: string
  expiresAt: Date
  userAgent?: string
  ipHash?: string
}

export const sessionRepository = {
  async create(input: CreateSessionInput) {
    return prisma.session.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
        ...(input.ipHash === undefined ? {} : { ipHash: input.ipHash }),
      },
    })
  },

  /**
   * The account a live session belongs to.
   *
   * Revoked and expired sessions are filtered in the query rather than checked
   * afterwards: a caller that forgets the check gets nothing, instead of
   * getting a session it should not have.
   */
  async resolve(tokenHash: string) {
    return prisma.session.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        user: { select: PUBLIC_FIELDS },
      },
    })
  },

  /** Recorded on use, so a person can tell a live session from a forgotten one. */
  async touch(id: string) {
    await prisma.session.update({ where: { id }, data: { lastUsedAt: new Date() } })
  },

  async listFor(userId: string) {
    return prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        userAgent: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
      orderBy: { lastUsedAt: "desc" },
    })
  },

  /**
   * Ends one session, and reports the token hash it ended.
   *
   * Scoped by user as well as by id, so a stolen session id cannot end someone
   * else's — this is the one place an authenticated caller names a row by id.
   *
   * The hash comes back because a revoked session may still be sitting in the
   * cache, and the caller is the only one that can drop it. A revocation the
   * cache does not hear about is a session that keeps working.
   */
  async revoke(userId: string, id: string): Promise<string | null> {
    return prisma.$transaction(async (tx) => {
      const session = await tx.session.findFirst({
        where: { id, userId, revokedAt: null },
        select: { tokenHash: true },
      })

      if (session === null) return null

      await tx.session.update({ where: { id }, data: { revokedAt: new Date() } })
      return session.tokenHash
    })
  },

  /**
   * Ends every session but one.
   *
   * What "sign out everywhere" and a password change both do. The exception is
   * the session doing the asking: signing someone out of the browser they are
   * currently using, as a consequence of securing their account, reads as a
   * failure.
   */
  async revokeAllExcept(userId: string, keepSessionId: string | null): Promise<string[]> {
    return prisma.$transaction(async (tx) => {
      const where = {
        userId,
        revokedAt: null,
        ...(keepSessionId === null ? {} : { NOT: { id: keepSessionId } }),
      }

      const affected = await tx.session.findMany({ where, select: { tokenHash: true } })
      await tx.session.updateMany({ where, data: { revokedAt: new Date() } })

      return affected.map((session) => session.tokenHash)
    })
  },

  /**
   * Removes sessions that ended some time ago.
   *
   * Expired rows are kept for a while rather than deleted on expiry: a person
   * looking at their account after an incident should be able to see the
   * session that was used, not an empty list.
   */
  async sweep(before: Date) {
    const { count } = await prisma.session.deleteMany({
      where: { expiresAt: { lt: before } },
    })

    return count
  },
}

export interface CreateTokenInput {
  userId: string
  tokenHash: string
  purpose: VerificationPurpose
  expiresAt: Date
}

export const verificationTokenRepository = {
  /**
   * Issues a token, and retires the outstanding ones for the same purpose.
   *
   * In one transaction, so a forwarded older email cannot be used after
   * somebody asks for a new link. Two requests in flight at once leave exactly
   * one usable token, which is the newer.
   */
  async issue(input: CreateTokenInput) {
    return prisma.$transaction(async (tx) => {
      await tx.verificationToken.updateMany({
        where: { userId: input.userId, purpose: input.purpose, consumedAt: null },
        data: { consumedAt: new Date() },
      })

      return tx.verificationToken.create({ data: input })
    })
  },

  /**
   * Spends a token and performs what it authorises, in one transaction.
   *
   * The effect runs inside the same transaction that marks the token consumed.
   * Consuming it first and acting afterwards leaves a window where the password
   * is unchanged and the link is spent; acting first and consuming afterwards
   * leaves a reset link that works twice. Both are the same bug from different
   * directions, and a transaction is the only answer to either.
   *
   * Returns null when the token does not exist, has expired, or has been used —
   * the caller cannot tell which, and neither can anyone probing it.
   */
  async consume<T>(
    tokenHash: string,
    purpose: VerificationPurpose,
    effect: (
      tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
      userId: string,
    ) => Promise<T>,
  ): Promise<T | null> {
    return prisma.$transaction(async (tx) => {
      // updateMany rather than findFirst-then-update: the update is the claim,
      // and its count is how we know we were the one to make it. Two requests
      // racing the same link produce one winner.
      const { count } = await tx.verificationToken.updateMany({
        where: {
          tokenHash,
          purpose,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      })

      if (count === 0) return null

      const token = await tx.verificationToken.findUnique({
        where: { tokenHash },
        select: { userId: true },
      })

      if (token === null) return null

      return effect(tx, token.userId)
    })
  },

  async sweep(before: Date) {
    const { count } = await prisma.verificationToken.deleteMany({
      where: { expiresAt: { lt: before } },
    })

    return count
  },
}
