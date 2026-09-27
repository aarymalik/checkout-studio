import { beforeEach, describe, expect, it } from "vitest"
import { prisma } from "../../src/client"
import {
  identityRepository,
  sessionRepository,
  verificationTokenRepository,
} from "../../src/repositories/identity"
import { truncateAll } from "../helpers"

const PASSWORD_HASH = "$argon2id$v=19$m=65536,t=3,p=1$c2FsdHNhbHQ$aGFzaGhhc2g"

beforeEach(truncateAll)

async function anAccount(email = "person@example.test") {
  return identityRepository.createAccount({ email, passwordHash: PASSWORD_HASH })
}

function inAnHour(): Date {
  return new Date(Date.now() + 60 * 60 * 1000)
}

describe("accounts", () => {
  it("stores an address lowercased, so one address is one account", async () => {
    const account = await identityRepository.createAccount({
      email: "Person@Example.TEST",
      passwordHash: PASSWORD_HASH,
    })

    expect(account.email).toBe("person@example.test")
    expect(await identityRepository.findByEmail("PERSON@example.test")).not.toBeNull()
  })

  it("refuses a second account for the same address, however it is spelled", async () => {
    await anAccount("person@example.test")

    await expect(anAccount("PERSON@EXAMPLE.TEST")).rejects.toThrow()
  })

  it("never returns the password hash with an account", async () => {
    // The absence is the safeguard: a value that is not in the shape cannot be
    // logged, serialised into a response, or swept into an export.
    const created = await anAccount()
    const found = await identityRepository.findByEmail("person@example.test")
    const byId = await identityRepository.findById(created.id)

    for (const shape of [created, found, byId]) {
      expect(shape).not.toHaveProperty("passwordHash")
    }
  })

  it("returns the hash only to the one method that exists to compare it", async () => {
    await anAccount()

    const credentials = await identityRepository.credentialsFor("person@example.test")

    expect(credentials?.passwordHash).toBe(PASSWORD_HASH)
    expect(Object.keys(credentials ?? {}).sort()).toEqual(["emailVerifiedAt", "id", "passwordHash"])
  })

  it("starts unverified", async () => {
    const account = await anAccount()

    expect(account.emailVerifiedAt).toBeNull()
  })

  it("records verification and a new password", async () => {
    const account = await anAccount()

    await identityRepository.markEmailVerified(account.id)
    await identityRepository.setPasswordHash(account.id, "$argon2id$v=19$m=65536,t=3,p=1$b$c")

    const after = await identityRepository.credentialsFor("person@example.test")
    expect(after?.emailVerifiedAt).not.toBeNull()
    expect(after?.passwordHash).toBe("$argon2id$v=19$m=65536,t=3,p=1$b$c")
  })

  it("reports nothing for an address that has no account", async () => {
    expect(await identityRepository.findByEmail("nobody@example.test")).toBeNull()
    expect(await identityRepository.credentialsFor("nobody@example.test")).toBeNull()
  })
})

describe("sessions", () => {
  it("resolves a live session to its account", async () => {
    const account = await anAccount()
    await sessionRepository.create({
      userId: account.id,
      tokenHash: "hash-1",
      expiresAt: inAnHour(),
    })

    const resolved = await sessionRepository.resolve("hash-1")

    expect(resolved?.userId).toBe(account.id)
    expect(resolved?.user.email).toBe("person@example.test")
  })

  it("does not resolve a revoked session", async () => {
    const account = await anAccount()
    const session = await sessionRepository.create({
      userId: account.id,
      tokenHash: "hash-1",
      expiresAt: inAnHour(),
    })

    await sessionRepository.revoke(account.id, session.id)

    expect(await sessionRepository.resolve("hash-1")).toBeNull()
  })

  it("does not resolve an expired session", async () => {
    const account = await anAccount()
    await sessionRepository.create({
      userId: account.id,
      tokenHash: "hash-1",
      expiresAt: new Date(Date.now() - 1000),
    })

    expect(await sessionRepository.resolve("hash-1")).toBeNull()
  })

  it("never resolves the account's hash along with the session", async () => {
    const account = await anAccount()
    await sessionRepository.create({
      userId: account.id,
      tokenHash: "hash-1",
      expiresAt: inAnHour(),
    })

    const resolved = await sessionRepository.resolve("hash-1")

    expect(resolved?.user).not.toHaveProperty("passwordHash")
  })

  it("refuses to revoke a session belonging to someone else", async () => {
    // Scoped by user as well as by id: a stolen session id must not end
    // another account's session.
    const owner = await anAccount("owner@example.test")
    const other = await anAccount("other@example.test")
    const session = await sessionRepository.create({
      userId: owner.id,
      tokenHash: "hash-1",
      expiresAt: inAnHour(),
    })

    expect(await sessionRepository.revoke(other.id, session.id)).toBeNull()
    expect(await sessionRepository.resolve("hash-1")).not.toBeNull()
  })

  it("reports whether it revoked anything, so a repeat is not a success", async () => {
    const account = await anAccount()
    const session = await sessionRepository.create({
      userId: account.id,
      tokenHash: "hash-1",
      expiresAt: inAnHour(),
    })

    // The hash comes back so the caller can drop the cache entry; a repeat
    // reports nothing, because there was nothing left to end.
    expect(await sessionRepository.revoke(account.id, session.id)).toBe("hash-1")
    expect(await sessionRepository.revoke(account.id, session.id)).toBeNull()
  })

  describe("ending every session", () => {
    it("keeps the one doing the asking", async () => {
      // Signing someone out of the browser they are using, as a consequence of
      // securing their account, reads as a failure.
      const account = await anAccount()
      const current = await sessionRepository.create({
        userId: account.id,
        tokenHash: "current",
        expiresAt: inAnHour(),
      })
      await sessionRepository.create({
        userId: account.id,
        tokenHash: "elsewhere",
        expiresAt: inAnHour(),
      })

      const ended = await sessionRepository.revokeAllExcept(account.id, current.id)

      expect(ended).toEqual(["elsewhere"])
      expect(await sessionRepository.resolve("current")).not.toBeNull()
      expect(await sessionRepository.resolve("elsewhere")).toBeNull()
    })

    it("ends all of them when there is none to keep", async () => {
      const account = await anAccount()
      await sessionRepository.create({
        userId: account.id,
        tokenHash: "a",
        expiresAt: inAnHour(),
      })
      await sessionRepository.create({
        userId: account.id,
        tokenHash: "b",
        expiresAt: inAnHour(),
      })

      expect((await sessionRepository.revokeAllExcept(account.id, null)).sort()).toEqual(["a", "b"])
    })

    it("leaves another account's sessions alone", async () => {
      const account = await anAccount("person@example.test")
      const other = await anAccount("other@example.test")
      await sessionRepository.create({
        userId: other.id,
        tokenHash: "theirs",
        expiresAt: inAnHour(),
      })

      await sessionRepository.revokeAllExcept(account.id, null)

      expect(await sessionRepository.resolve("theirs")).not.toBeNull()
    })
  })

  it("lists the live ones, most recently used first", async () => {
    const account = await anAccount()
    const older = await sessionRepository.create({
      userId: account.id,
      tokenHash: "older",
      expiresAt: inAnHour(),
      userAgent: "Firefox",
    })
    await sessionRepository.create({
      userId: account.id,
      tokenHash: "newer",
      expiresAt: inAnHour(),
      userAgent: "Safari",
    })

    await sessionRepository.touch(older.id)
    const listed = await sessionRepository.listFor(account.id)

    expect(listed.map((session) => session.userAgent)).toEqual(["Firefox", "Safari"])
    expect(listed[0]).not.toHaveProperty("tokenHash")
  })

  it("sweeps sessions that ended some time ago", async () => {
    const account = await anAccount()
    await sessionRepository.create({
      userId: account.id,
      tokenHash: "old",
      expiresAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    })
    await sessionRepository.create({
      userId: account.id,
      tokenHash: "live",
      expiresAt: inAnHour(),
    })

    const removed = await sessionRepository.sweep(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))

    expect(removed).toBe(1)
    expect(await prisma.session.count()).toBe(1)
  })
})

describe("one-time tokens", () => {
  it("performs the effect and spends the token together", async () => {
    const account = await anAccount()
    await verificationTokenRepository.issue({
      userId: account.id,
      tokenHash: "token-1",
      purpose: "reset_password",
      expiresAt: inAnHour(),
    })

    const result = await verificationTokenRepository.consume(
      "token-1",
      "reset_password",
      async (tx, userId) => {
        await tx.user.update({ where: { id: userId }, data: { fullName: "Changed" } })
        return userId
      },
    )

    expect(result).toBe(account.id)
    expect((await identityRepository.findById(account.id))?.fullName).toBe("Changed")
  })

  it("cannot be used twice", async () => {
    const account = await anAccount()
    await verificationTokenRepository.issue({
      userId: account.id,
      tokenHash: "token-1",
      purpose: "reset_password",
      expiresAt: inAnHour(),
    })

    const first = await verificationTokenRepository.consume(
      "token-1",
      "reset_password",
      async () => "done",
    )
    const second = await verificationTokenRepository.consume(
      "token-1",
      "reset_password",
      async () => "done",
    )

    expect(first).toBe("done")
    expect(second).toBeNull()
  })

  it("cannot be used twice even by two requests at once", async () => {
    // The update is the claim, and its count is how we know we made it. Racing
    // the same link produces one winner.
    const account = await anAccount()
    await verificationTokenRepository.issue({
      userId: account.id,
      tokenHash: "token-1",
      purpose: "reset_password",
      expiresAt: inAnHour(),
    })

    const results = await Promise.all([
      verificationTokenRepository.consume("token-1", "reset_password", async () => "a"),
      verificationTokenRepository.consume("token-1", "reset_password", async () => "b"),
    ])

    expect(results.filter((result) => result !== null)).toHaveLength(1)
  })

  it("leaves the token unspent when the effect fails", async () => {
    // Both halves are in one transaction, so a failed reset does not burn the
    // link the person is holding.
    const account = await anAccount()
    await verificationTokenRepository.issue({
      userId: account.id,
      tokenHash: "token-1",
      purpose: "reset_password",
      expiresAt: inAnHour(),
    })

    await expect(
      verificationTokenRepository.consume("token-1", "reset_password", async () => {
        throw new Error("the update failed")
      }),
    ).rejects.toThrow("the update failed")

    const retry = await verificationTokenRepository.consume(
      "token-1",
      "reset_password",
      async () => "done",
    )
    expect(retry).toBe("done")
  })

  it("refuses an expired token", async () => {
    const account = await anAccount()
    await verificationTokenRepository.issue({
      userId: account.id,
      tokenHash: "token-1",
      purpose: "reset_password",
      expiresAt: new Date(Date.now() - 1000),
    })

    expect(
      await verificationTokenRepository.consume("token-1", "reset_password", async () => "done"),
    ).toBeNull()
  })

  it("refuses a token issued for something else", async () => {
    // A verification link must not reset a password.
    const account = await anAccount()
    await verificationTokenRepository.issue({
      userId: account.id,
      tokenHash: "token-1",
      purpose: "verify_email",
      expiresAt: inAnHour(),
    })

    expect(
      await verificationTokenRepository.consume("token-1", "reset_password", async () => "done"),
    ).toBeNull()
  })

  it("retires the outstanding token when a new one is issued", async () => {
    // A forwarded older email must not work after somebody asks again.
    const account = await anAccount()
    await verificationTokenRepository.issue({
      userId: account.id,
      tokenHash: "older",
      purpose: "reset_password",
      expiresAt: inAnHour(),
    })
    await verificationTokenRepository.issue({
      userId: account.id,
      tokenHash: "newer",
      purpose: "reset_password",
      expiresAt: inAnHour(),
    })

    expect(
      await verificationTokenRepository.consume("older", "reset_password", async () => "done"),
    ).toBeNull()
    expect(
      await verificationTokenRepository.consume("newer", "reset_password", async () => "done"),
    ).toBe("done")
  })

  it("leaves a token for another purpose alone when issuing", async () => {
    const account = await anAccount()
    await verificationTokenRepository.issue({
      userId: account.id,
      tokenHash: "verify",
      purpose: "verify_email",
      expiresAt: inAnHour(),
    })
    await verificationTokenRepository.issue({
      userId: account.id,
      tokenHash: "reset",
      purpose: "reset_password",
      expiresAt: inAnHour(),
    })

    expect(
      await verificationTokenRepository.consume("verify", "verify_email", async () => "done"),
    ).toBe("done")
  })

  it("reports nothing for a token that never existed", async () => {
    expect(
      await verificationTokenRepository.consume("never", "reset_password", async () => "done"),
    ).toBeNull()
  })
})
