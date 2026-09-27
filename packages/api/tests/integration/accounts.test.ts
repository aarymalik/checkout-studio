import { beforeEach, describe, expect, it } from "vitest"
import { prisma } from "@checkout-studio/database"
import { redis, whenReady } from "@checkout-studio/cache"
import {
  changePassword,
  requestPasswordReset,
  resetPassword,
  signIn,
  signUp,
  verifyEmail,
} from "../../src/services/auth/accounts"
import { recordingSender } from "../../src/services/auth/email"
import { createSession, resolveSession } from "../../src/services/auth/session"
import { hash as argon2Hash } from "@node-rs/argon2"

/** Writes the test password with whatever parameters are asked for. */
async function hashWith(parameters: {
  memoryCost: number
  timeCost: number
  parallelism: number
}): Promise<string> {
  return argon2Hash(PASSWORD, parameters)
}

/**
 * The account flows, against a real database and a real Redis.
 *
 * The property most of these exist to protect is that the product answers the
 * same way whether or not an address has an account. Losing it turns the
 * sign-up form into a way to ask "is this person a customer?", one address at
 * a time.
 */
const PASSWORD = "ambling walrus thicket ninety"
const SECRET = "test-secret-not-used-anywhere-else"

function dependencies() {
  const email = recordingSender()
  return { email, appUrl: "https://studio.example.test", sessionSecret: SECRET }
}

/** The token out of the most recent link, as a person would take it from an email. */
function tokenFrom(sender: ReturnType<typeof recordingSender>): string {
  const last = sender.sent.at(-1)
  const match = /token=([A-Za-z0-9_-]+)/.exec(last?.text ?? "")
  return match?.[1] ?? ""
}

beforeEach(async () => {
  await whenReady()
  await redis.flushdb()
  await prisma.session.deleteMany()
  await prisma.verificationToken.deleteMany()
  await prisma.user.deleteMany()
})

describe("signing up", () => {
  it("creates an account and sends one link", async () => {
    const deps = dependencies()

    await signUp({ email: "person@example.test", password: PASSWORD }, deps)

    expect(await prisma.user.count()).toBe(1)
    expect(deps.email.sent).toHaveLength(1)
    expect(deps.email.sent[0]?.subject).toBe("Confirm your email address")
  })

  it("stores the address lowercased", async () => {
    await signUp({ email: "Person@Example.TEST", password: PASSWORD }, dependencies())

    expect((await prisma.user.findFirst())?.email).toBe("person@example.test")
  })

  it("never stores the password", async () => {
    await signUp({ email: "person@example.test", password: PASSWORD }, dependencies())

    const stored = await prisma.user.findFirstOrThrow()
    expect(stored.passwordHash).not.toContain(PASSWORD)
    expect(stored.passwordHash.startsWith("$argon2id$")).toBe(true)
  })

  it("leaves the account unable to sign in until the address is proved", async () => {
    await signUp({ email: "person@example.test", password: PASSWORD }, dependencies())

    expect(await signIn({ email: "person@example.test", password: PASSWORD })).toBeNull()
  })

  it("refuses a password that is too short, and says what to do", async () => {
    await expect(
      signUp({ email: "person@example.test", password: "short" }, dependencies()),
    ).rejects.toMatchObject({ code: expect.stringContaining("VALIDATION") })

    expect(await prisma.user.count()).toBe(0)
  })

  it("refuses a password everyone tries", async () => {
    await expect(
      signUp({ email: "person@example.test", password: "p@ssw0rd1234" }, dependencies()),
    ).rejects.toThrow()
  })

  describe("when the address already has an account", () => {
    it("says nothing different to whoever typed it", async () => {
      // The whole point. A form that says "already registered" is a form that
      // answers "is this person a customer?" for anyone who asks.
      const first = dependencies()
      await signUp({ email: "person@example.test", password: PASSWORD }, first)

      const second = dependencies()
      await expect(
        signUp({ email: "person@example.test", password: PASSWORD }, second),
      ).resolves.toBeUndefined()

      expect(await prisma.user.count()).toBe(1)
    })

    it("sends the owner another link if they never finished", async () => {
      const first = dependencies()
      await signUp({ email: "person@example.test", password: PASSWORD }, first)

      const second = dependencies()
      await signUp({ email: "person@example.test", password: "a different one entirely" }, second)

      expect(second.email.sent).toHaveLength(1)
    })

    it("does not re-send to an account that is already verified", async () => {
      const first = dependencies()
      await signUp({ email: "person@example.test", password: PASSWORD }, first)
      await verifyEmail(tokenFrom(first.email))

      const second = dependencies()
      await signUp({ email: "person@example.test", password: PASSWORD }, second)

      expect(second.email.sent).toHaveLength(0)
    })

    it("does not change the existing password", async () => {
      const first = dependencies()
      await signUp({ email: "person@example.test", password: PASSWORD }, first)
      await verifyEmail(tokenFrom(first.email))

      await signUp(
        { email: "person@example.test", password: "an attacker's choice" },
        dependencies(),
      )

      expect(await signIn({ email: "person@example.test", password: PASSWORD })).not.toBeNull()
      expect(
        await signIn({ email: "person@example.test", password: "an attacker's choice" }),
      ).toBeNull()
    })
  })
})

describe("verifying an address", () => {
  it("lets the account sign in", async () => {
    const deps = dependencies()
    await signUp({ email: "person@example.test", password: PASSWORD }, deps)

    expect(await verifyEmail(tokenFrom(deps.email))).toBe(true)
    expect(await signIn({ email: "person@example.test", password: PASSWORD })).not.toBeNull()
  })

  it("works once", async () => {
    const deps = dependencies()
    await signUp({ email: "person@example.test", password: PASSWORD }, deps)
    const token = tokenFrom(deps.email)

    expect(await verifyEmail(token)).toBe(true)
    expect(await verifyEmail(token)).toBe(false)
  })

  it("refuses a token that was never issued", async () => {
    expect(await verifyEmail("not-a-token")).toBe(false)
  })

  it("refuses a reset token, which authorises something else", async () => {
    const deps = dependencies()
    await signUp({ email: "person@example.test", password: PASSWORD }, deps)
    await verifyEmail(tokenFrom(deps.email))
    await requestPasswordReset("person@example.test", deps)

    expect(await verifyEmail(tokenFrom(deps.email))).toBe(false)
  })
})

describe("signing in", () => {
  async function aVerifiedAccount(email = "person@example.test") {
    const deps = dependencies()
    await signUp({ email, password: PASSWORD }, deps)
    await verifyEmail(tokenFrom(deps.email))
    return deps
  }

  it("accepts the right password", async () => {
    await aVerifiedAccount()

    expect(await signIn({ email: "person@example.test", password: PASSWORD })).toMatchObject({
      userId: expect.any(String),
    })
  })

  it("refuses the wrong one", async () => {
    await aVerifiedAccount()

    expect(
      await signIn({ email: "person@example.test", password: "wrong but long enough" }),
    ).toBeNull()
  })

  it("refuses an address with no account", async () => {
    expect(await signIn({ email: "nobody@example.test", password: PASSWORD })).toBeNull()
  })

  it("ignores how the address was capitalised", async () => {
    await aVerifiedAccount()

    expect(await signIn({ email: "PERSON@EXAMPLE.TEST", password: PASSWORD })).not.toBeNull()
  })

  it("rehashes a password stored with weaker parameters, while it is known to be right", async () => {
    /*
     * The one moment the password is in memory and correct. Raising the cost
     * parameters later is only safe because of this: every account moves up on
     * its next sign-in, without anybody being asked to do anything.
     */
    await aVerifiedAccount()
    const account = await prisma.user.findFirstOrThrow()

    // As yesterday's parameters would have written it.
    await prisma.user.update({
      where: { id: account.id },
      data: { passwordHash: await hashWith({ memoryCost: 19_456, timeCost: 2, parallelism: 1 }) },
    })

    expect(await signIn({ email: "person@example.test", password: PASSWORD })).not.toBeNull()

    const after = await prisma.user.findFirstOrThrow()
    expect(after.passwordHash).toContain("m=65536,t=3")
  })

  it("takes comparable time for an unknown address and a wrong password", async () => {
    /*
     * Without the decoy hash, an unknown address returns in microseconds while
     * a real one spends a tenth of a second in Argon2id — which is a way to
     * enumerate every customer no matter how the response is worded.
     */
    await aVerifiedAccount()

    const wrongStart = performance.now()
    await signIn({ email: "person@example.test", password: "wrong but long enough" })
    const wrong = performance.now() - wrongStart

    const unknownStart = performance.now()
    await signIn({ email: "nobody@example.test", password: "wrong but long enough" })
    const unknown = performance.now() - unknownStart

    // Generous: this is a shared machine. The failure it catches is an order of
    // magnitude, not a percentage.
    expect(unknown).toBeGreaterThan(wrong / 4)
  })
})

describe("resetting a password", () => {
  async function aVerifiedAccount() {
    const deps = dependencies()
    await signUp({ email: "person@example.test", password: PASSWORD }, deps)
    await verifyEmail(tokenFrom(deps.email))
    return deps
  }

  it("sends a link and accepts a new password", async () => {
    const deps = await aVerifiedAccount()
    await requestPasswordReset("person@example.test", deps)

    expect(deps.email.sent.at(-1)?.subject).toBe("Reset your password")
    expect(await resetPassword(tokenFrom(deps.email), "a brand new passphrase")).toBe(true)
    expect(
      await signIn({ email: "person@example.test", password: "a brand new passphrase" }),
    ).not.toBeNull()
  })

  it("makes the old password stop working", async () => {
    const deps = await aVerifiedAccount()
    await requestPasswordReset("person@example.test", deps)
    await resetPassword(tokenFrom(deps.email), "a brand new passphrase")

    expect(await signIn({ email: "person@example.test", password: PASSWORD })).toBeNull()
  })

  it("sends nothing for an address with no account, and does not say so", async () => {
    const deps = dependencies()

    await expect(requestPasswordReset("nobody@example.test", deps)).resolves.toBeUndefined()
    expect(deps.email.sent).toHaveLength(0)
  })

  it("ends every session, because somebody may already have one", async () => {
    const deps = await aVerifiedAccount()
    const account = await prisma.user.findFirstOrThrow()
    const stolen = await createSession(account.id, {}, SECRET)
    await resolveSession(stolen.token)

    await requestPasswordReset("person@example.test", deps)
    await resetPassword(tokenFrom(deps.email), "a brand new passphrase")

    expect(await resolveSession(stolen.token)).toBeNull()
  })

  it("works once", async () => {
    const deps = await aVerifiedAccount()
    await requestPasswordReset("person@example.test", deps)
    const token = tokenFrom(deps.email)

    expect(await resetPassword(token, "a brand new passphrase")).toBe(true)
    expect(await resetPassword(token, "another one entirely")).toBe(false)
  })

  it("refuses a weak password before spending the link", async () => {
    const deps = await aVerifiedAccount()
    await requestPasswordReset("person@example.test", deps)
    const token = tokenFrom(deps.email)

    await expect(resetPassword(token, "short")).rejects.toThrow()

    // The link survives, so the person can try again with a better one.
    expect(await resetPassword(token, "a brand new passphrase")).toBe(true)
  })

  it("proves the address, since the link was sent to it", async () => {
    const deps = dependencies()
    await signUp({ email: "person@example.test", password: PASSWORD }, deps)
    await requestPasswordReset("person@example.test", deps)

    await resetPassword(tokenFrom(deps.email), "a brand new passphrase")

    expect((await prisma.user.findFirstOrThrow()).emailVerifiedAt).not.toBeNull()
  })
})

describe("changing a password", () => {
  async function signedIn() {
    const deps = dependencies()
    await signUp({ email: "person@example.test", password: PASSWORD }, deps)
    await verifyEmail(tokenFrom(deps.email))
    const account = await prisma.user.findFirstOrThrow()
    const session = await createSession(account.id, {}, SECRET)
    return { account, session }
  }

  it("requires the current password, even though the session proves who they are", async () => {
    // A session is left behind on a shared computer far more often than a
    // password is given away.
    const { account, session } = await signedIn()

    expect(
      await changePassword({
        userId: account.id,
        sessionId: session.sessionId,
        currentPassword: "not the right one",
        newPassword: "a brand new passphrase",
      }),
    ).toBe(false)

    expect(await signIn({ email: "person@example.test", password: PASSWORD })).not.toBeNull()
  })

  it("changes it when the current one is right", async () => {
    const { account, session } = await signedIn()

    expect(
      await changePassword({
        userId: account.id,
        sessionId: session.sessionId,
        currentPassword: PASSWORD,
        newPassword: "a brand new passphrase",
      }),
    ).toBe(true)

    expect(
      await signIn({ email: "person@example.test", password: "a brand new passphrase" }),
    ).not.toBeNull()
  })

  it("ends every other session but keeps this one", async () => {
    const { account, session } = await signedIn()
    const elsewhere = await createSession(account.id, {}, SECRET)

    await changePassword({
      userId: account.id,
      sessionId: session.sessionId,
      currentPassword: PASSWORD,
      newPassword: "a brand new passphrase",
    })

    expect(await resolveSession(session.token)).not.toBeNull()
    expect(await resolveSession(elsewhere.token)).toBeNull()
  })

  it("refuses a weak new password without touching the old one", async () => {
    const { account, session } = await signedIn()

    await expect(
      changePassword({
        userId: account.id,
        sessionId: session.sessionId,
        currentPassword: PASSWORD,
        newPassword: "short",
      }),
    ).rejects.toThrow()

    expect(await signIn({ email: "person@example.test", password: PASSWORD })).not.toBeNull()
  })
})

describe("what the emails say", () => {
  it("carries a link that works and says when it stops", async () => {
    const deps = dependencies()
    await signUp({ email: "person@example.test", password: PASSWORD }, deps)

    const message = deps.email.sent[0]
    expect(message?.text).toContain("https://studio.example.test/verify?token=")
    expect(message?.text).toContain("24 hours")
    expect(message?.html).toContain("https://studio.example.test/verify?token=")
  })

  it("tells a reset recipient what to do if it was not them", async () => {
    const deps = dependencies()
    await signUp({ email: "person@example.test", password: PASSWORD }, deps)
    await verifyEmail(tokenFrom(deps.email))
    await requestPasswordReset("person@example.test", deps)

    expect(deps.email.sent.at(-1)?.text).toContain("If it was not you")
  })

  it("never contains the password", async () => {
    const deps = dependencies()
    await signUp({ email: "person@example.test", password: PASSWORD }, deps)

    for (const message of deps.email.sent) {
      expect(message.text).not.toContain(PASSWORD)
      expect(message.html).not.toContain(PASSWORD)
    }
  })
})
