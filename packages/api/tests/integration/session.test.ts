import { beforeEach, describe, expect, it } from "vitest"
import { redis, whenReady } from "@checkout-studio/cache"

import {
  claim,
  current,
  heartbeat,
  release,
  sessionKey,
  takeover,
  SESSION_TTL_SECONDS,
} from "../../src/services/pages/session"

/**
 * Edit sessions.
 *
 * One writer per page. Not a correctness mechanism — that is version checking,
 * which has no expiry window — but the thing that turns "your changes were
 * rejected" into "this page is open somewhere else".
 */

const PAGE = "pag_test"

function session(sessionId: string, label = "Chrome on macOS") {
  return {
    pageId: PAGE,
    sessionId,
    userId: "user_1",
    clientLabel: label,
    baseVersion: 3,
  }
}

beforeEach(async () => {
  await whenReady()
  await redis.flushdb()
})

describe("claiming", () => {
  it("takes a free page", async () => {
    const result = await claim(session("sess_a"))

    expect(result).toMatchObject({ held: true, session: { sessionId: "sess_a", baseVersion: 3 } })
  })

  it("reports who holds a page that is taken", async () => {
    await claim(session("sess_a", "Chrome on macOS"))

    const result = await claim(session("sess_b", "Safari on iOS"))

    expect(result.held).toBe(false)
    expect(!result.held && result.holder).toMatchObject({
      sessionId: "sess_a",
      clientLabel: "Chrome on macOS",
    })
  })

  // A reload should not lock somebody out of their own page for ninety seconds.
  it("refreshes a session that re-claims its own page", async () => {
    await claim(session("sess_a"))

    const again = await claim({ ...session("sess_a"), baseVersion: 9 })

    expect(again).toMatchObject({ held: true, session: { baseVersion: 9 } })
  })

  it("gives the lock an expiry, so a closed tab needs no manual unlock", async () => {
    await claim(session("sess_a"))

    const ttl = await redis.ttl(sessionKey(PAGE))

    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(SESSION_TTL_SECONDS)
  })

  it("lets the next session in once the lock has gone", async () => {
    await claim(session("sess_a"))
    await redis.del(sessionKey(PAGE))

    expect((await claim(session("sess_b"))).held).toBe(true)
  })

  // Only one of two simultaneous claims may win, which is what SET NX buys.
  it("lets exactly one of several simultaneous claims win", async () => {
    const results = await Promise.all([
      claim(session("sess_a")),
      claim(session("sess_b")),
      claim(session("sess_c")),
    ])

    expect(results.filter((result) => result.held)).toHaveLength(1)
  })

  // A value we cannot read is a value we cannot honour; treating it as absent
  // lets the next person edit rather than locking the page forever.
  it("takes over a lock whose contents are unreadable", async () => {
    await redis.set(sessionKey(PAGE), "not json", "EX", SESSION_TTL_SECONDS)

    expect((await claim(session("sess_b"))).held).toBe(true)
  })
})

describe("heartbeat", () => {
  it("keeps a session alive", async () => {
    await claim(session("sess_a"))

    expect(await heartbeat({ pageId: PAGE, sessionId: "sess_a" })).toBe(true)
  })

  it("records when it last heard from the client", async () => {
    await claim({ ...session("sess_a"), now: new Date("2026-01-01T00:00:00.000Z") })
    await heartbeat({
      pageId: PAGE,
      sessionId: "sess_a",
      now: new Date("2026-01-01T00:00:30.000Z"),
    })

    const holder = await current(PAGE)

    expect(holder?.startedAt).toBe("2026-01-01T00:00:00.000Z")
    expect(holder?.lastHeartbeatAt).toBe("2026-01-01T00:00:30.000Z")
  })

  it("pushes the expiry out", async () => {
    await claim(session("sess_a"))
    await redis.expire(sessionKey(PAGE), 5)
    await heartbeat({ pageId: PAGE, sessionId: "sess_a" })

    expect(await redis.ttl(sessionKey(PAGE))).toBeGreaterThan(5)
  })

  // How a client learns it has lost the page without being told by anything
  // else.
  it("fails for a session that no longer holds the page", async () => {
    await claim(session("sess_a"))

    expect(await heartbeat({ pageId: PAGE, sessionId: "sess_b" })).toBe(false)
  })

  it("fails when the page is held by nobody", async () => {
    expect(await heartbeat({ pageId: PAGE, sessionId: "sess_a" })).toBe(false)
  })
})

describe("takeover", () => {
  it("transfers the page", async () => {
    await claim(session("sess_a"))

    const taken = await takeover(session("sess_b", "Safari on iOS"))

    expect(taken.sessionId).toBe("sess_b")
    expect((await current(PAGE))?.clientLabel).toBe("Safari on iOS")
  })

  it("leaves the previous holder unable to heartbeat", async () => {
    await claim(session("sess_a"))
    await takeover(session("sess_b"))

    expect(await heartbeat({ pageId: PAGE, sessionId: "sess_a" })).toBe(false)
  })

  it("works on a page nobody holds", async () => {
    const taken = await takeover(session("sess_b"))

    expect(taken.sessionId).toBe("sess_b")
  })

  it("records the version the new session starts from", async () => {
    await claim(session("sess_a"))

    const taken = await takeover({ ...session("sess_b"), baseVersion: 12 })

    expect(taken.baseVersion).toBe(12)
  })
})

describe("release", () => {
  it("frees the page", async () => {
    await claim(session("sess_a"))

    expect(await release(PAGE, "sess_a")).toBe(true)
    expect(await current(PAGE)).toBeNull()
  })

  // Otherwise a stale client's unload handler unlocks the page somebody else
  // just took over.
  it("refuses a session that does not hold the page", async () => {
    await claim(session("sess_a"))

    expect(await release(PAGE, "sess_b")).toBe(false)
    expect((await current(PAGE))?.sessionId).toBe("sess_a")
  })

  it("refuses when nobody holds it", async () => {
    expect(await release(PAGE, "sess_a")).toBe(false)
  })
})

describe("current", () => {
  it("reports nobody for a free page", async () => {
    expect(await current(PAGE)).toBeNull()
  })

  it("reports the holder", async () => {
    await claim(session("sess_a"))

    expect((await current(PAGE))?.sessionId).toBe("sess_a")
  })
})
