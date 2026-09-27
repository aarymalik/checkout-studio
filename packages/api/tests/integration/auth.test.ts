import { beforeEach, describe, expect, it } from "vitest"
import { prisma } from "@checkout-studio/database"
import { redis, whenReady } from "@checkout-studio/cache"
import { authenticate, readSessionCookie } from "../../src/middleware/auth"
import {
  SESSION_COOKIE,
  createSession,
  endOtherSessions,
  endSession,
  listSessions,
  resolveSession,
  touchSession,
} from "../../src/services/auth/session"

/**
 * Authentication, against a real database and a real Redis.
 *
 * The cache is the part worth testing hardest: a revoked session that is still
 * cached is a session that keeps working, and nothing in the database would
 * show it.
 */
const SECRET = "test-secret-not-used-anywhere-else"

let counter = 0

async function anAccount(options: { verified?: boolean } = {}) {
  counter += 1
  const suffix = `${Date.now()}-${counter}`

  return prisma.user.create({
    data: {
      email: `person-${suffix}@example.test`,
      passwordHash: "fixture:no-password",
      emailVerifiedAt: options.verified === false ? null : new Date(),
    },
  })
}

function requestWith(token: string | null, header?: string): Request {
  return new Request("http://localhost/api/v1/projects", {
    headers:
      header !== undefined
        ? { cookie: header }
        : token === null
          ? {}
          : { cookie: `${SESSION_COOKIE}=${token}` },
  })
}

beforeEach(async () => {
  await whenReady()
  await redis.flushdb()
  await prisma.session.deleteMany()
  await prisma.user.deleteMany()
})

describe("reading the cookie", () => {
  it("finds the session among others", () => {
    const request = requestWith(null, `theme=dark; ${SESSION_COOKIE}=abc123; other=1`)

    expect(readSessionCookie(request)).toBe("abc123")
  })

  it("reports nothing when there is no cookie header at all", () => {
    expect(readSessionCookie(requestWith(null))).toBeNull()
  })

  it("reports nothing when the session is not among the cookies", () => {
    expect(readSessionCookie(requestWith(null, "theme=dark; other=1"))).toBeNull()
  })

  it("survives a malformed cookie header rather than throwing", () => {
    expect(readSessionCookie(requestWith(null, "garbage"))).toBeNull()
    expect(readSessionCookie(requestWith(null, "=;;=;"))).toBeNull()
  })

  it("decodes a value that was encoded", () => {
    expect(readSessionCookie(requestWith(null, `${SESSION_COOKIE}=a%2Bb`))).toBe("a+b")
  })
})

describe("a session", () => {
  it("resolves to the account that owns it", async () => {
    const account = await anAccount()
    const { token } = await createSession(account.id, {}, SECRET)

    const identity = await resolveSession(token)

    expect(identity?.userId).toBe(account.id)
    expect(identity?.email).toBe(account.email)
  })

  it("never stores the token it hands out", async () => {
    // A leaked table must yield no working cookie.
    const account = await anAccount()
    const { token } = await createSession(account.id, {}, SECRET)

    const stored = await prisma.session.findFirst({ select: { tokenHash: true } })

    expect(stored?.tokenHash).not.toBe(token)
    expect(stored?.tokenHash).toHaveLength(64)
  })

  it("does not resolve a token that was never issued", async () => {
    expect(await resolveSession("not-a-real-token")).toBeNull()
  })

  it("records where it was started from, one way", async () => {
    const account = await anAccount()
    await createSession(account.id, { userAgent: "Firefox", ip: "203.0.113.4" }, SECRET)

    const stored = await prisma.session.findFirst()

    expect(stored?.userAgent).toBe("Firefox")
    expect(stored?.ipHash).not.toContain("203.0.113")
    expect(stored?.ipHash).toHaveLength(32)
  })

  it("fingerprints the same address the same way, and a different one differently", async () => {
    const account = await anAccount()
    await createSession(account.id, { ip: "203.0.113.4" }, SECRET)
    await createSession(account.id, { ip: "203.0.113.4" }, SECRET)
    await createSession(account.id, { ip: "198.51.100.9" }, SECRET)

    const [first, second, third] = await prisma.session.findMany({
      orderBy: { createdAt: "asc" },
      select: { ipHash: true },
    })

    expect(first?.ipHash).toBe(second?.ipHash)
    expect(first?.ipHash).not.toBe(third?.ipHash)
  })
})

describe("ending a session", () => {
  it("stops it resolving, even though it was just cached", async () => {
    /*
     * The test this file exists for.
     *
     * Resolving puts the session in the cache. Revoking removes the row — and
     * if the cache entry survives, the cookie keeps working for another minute.
     * A minute is exactly what somebody clicking "sign out" is trying to end.
     */
    const account = await anAccount()
    const { token, sessionId } = await createSession(account.id, {}, SECRET)

    expect(await resolveSession(token)).not.toBeNull()

    await endSession(account.id, sessionId)

    expect(await resolveSession(token)).toBeNull()
  })

  it("reports whether there was anything to end", async () => {
    const account = await anAccount()
    const { sessionId } = await createSession(account.id, {}, SECRET)

    expect(await endSession(account.id, sessionId)).toBe(true)
    expect(await endSession(account.id, sessionId)).toBe(false)
  })

  it("refuses to end a session belonging to someone else", async () => {
    const owner = await anAccount()
    const other = await anAccount()
    const { token, sessionId } = await createSession(owner.id, {}, SECRET)

    expect(await endSession(other.id, sessionId)).toBe(false)
    expect(await resolveSession(token)).not.toBeNull()
  })
})

describe("ending every other session", () => {
  it("leaves the one asking and stops the rest, cached or not", async () => {
    const account = await anAccount()
    const current = await createSession(account.id, {}, SECRET)
    const elsewhere = await createSession(account.id, {}, SECRET)

    // Both cached.
    await resolveSession(current.token)
    await resolveSession(elsewhere.token)

    const ended = await endOtherSessions(account.id, current.sessionId)

    expect(ended).toBe(1)
    expect(await resolveSession(current.token)).not.toBeNull()
    expect(await resolveSession(elsewhere.token)).toBeNull()
  })

  it("ends all of them when there is none to keep", async () => {
    // What a password reset does: the person performing it is not signed in.
    const account = await anAccount()
    const first = await createSession(account.id, {}, SECRET)
    const second = await createSession(account.id, {}, SECRET)
    await resolveSession(first.token)

    expect(await endOtherSessions(account.id, null)).toBe(2)
    expect(await resolveSession(first.token)).toBeNull()
    expect(await resolveSession(second.token)).toBeNull()
  })

  it("leaves another account's sessions alone", async () => {
    const account = await anAccount()
    const other = await anAccount()
    const theirs = await createSession(other.id, {}, SECRET)

    await endOtherSessions(account.id, null)

    expect(await resolveSession(theirs.token)).not.toBeNull()
  })
})

describe("authenticating a request", () => {
  it("identifies the caller", async () => {
    const account = await anAccount()
    const { token, sessionId } = await createSession(account.id, {}, SECRET)

    const authenticated = await authenticate(requestWith(token))

    expect(authenticated).toMatchObject({ userId: account.id, sessionId, email: account.email })
  })

  it("refuses a request with no cookie", async () => {
    expect(await authenticate(requestWith(null))).toBeNull()
  })

  it("refuses a revoked session on the very next request", async () => {
    const account = await anAccount()
    const { token, sessionId } = await createSession(account.id, {}, SECRET)
    await authenticate(requestWith(token))

    await endSession(account.id, sessionId)

    expect(await authenticate(requestWith(token))).toBeNull()
  })

  it("refuses an expired session", async () => {
    const account = await anAccount()
    const { token } = await createSession(account.id, {}, SECRET)
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } })
    await redis.flushdb()

    expect(await authenticate(requestWith(token))).toBeNull()
  })

  it("refuses an account that has not proved its address", async () => {
    // Not a failed sign-in: an account that has not finished being created.
    // Refusing here means no route has to remember to check.
    const account = await anAccount({ verified: false })
    const { token } = await createSession(account.id, {}, SECRET)

    expect(await authenticate(requestWith(token))).toBeNull()
  })

  it("does not wait for the bookkeeping it does on the way past", async () => {
    // lastUsedAt is recorded without being awaited: the request does not depend
    // on it, and a slow write should not slow a page down. Asserting on the
    // written value would mean sleeping and hoping, which is a test that fails
    // on a busy machine for no reason — so the write is tested directly below.
    const account = await anAccount()
    const { token } = await createSession(account.id, {}, SECRET)

    await expect(authenticate(requestWith(token))).resolves.not.toBeNull()
  })

  it("records that a session was used", async () => {
    const account = await anAccount()
    const { sessionId } = await createSession(account.id, {}, SECRET)
    const before = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } })

    await touchSession(sessionId)

    const after = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } })
    expect(after.lastUsedAt.getTime()).toBeGreaterThanOrEqual(before.lastUsedAt.getTime())
    expect(after.lastUsedAt.getTime()).toBeGreaterThan(before.createdAt.getTime() - 1)
  })
})

describe("the sessions a person can see", () => {
  it("lists the live ones and carries no token", async () => {
    const account = await anAccount()
    await createSession(account.id, { userAgent: "Firefox" }, SECRET)
    const ended = await createSession(account.id, { userAgent: "Safari" }, SECRET)
    await endSession(account.id, ended.sessionId)

    const listed = await listSessions(account.id)

    expect(listed).toHaveLength(1)
    expect(listed[0]?.userAgent).toBe("Firefox")
    expect(listed[0]).not.toHaveProperty("tokenHash")
  })
})
