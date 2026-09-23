import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * `next build` imports every route module to read its configuration. A module
 * that connects while being imported makes the build — and every developer
 * without a local Redis — depend on a reachable one.
 */
const cached = globalThis as { redis?: unknown }

describe("the cache client", () => {
  const url = process.env["REDIS_URL"]

  afterEach(() => {
    if (url === undefined) delete process.env["REDIS_URL"]
    else process.env["REDIS_URL"] = url
    vi.resetModules()
  })

  it("imports without a URL, so a build can collect route config", async () => {
    delete process.env["REDIS_URL"]
    vi.resetModules()

    await expect(import("../src/client")).resolves.toHaveProperty("redis")
  })

  it("reports the missing URL on first use, not on import", async () => {
    delete process.env["REDIS_URL"]
    vi.resetModules()

    // The live connection is set aside rather than discarded: an orphaned
    // client is never quit, and the test process would not exit.
    const connection = cached.redis
    delete cached.redis

    try {
      const { redis } = await import("../src/client")
      expect(() => redis.status).toThrow(/REDIS_URL is not set/)
    } finally {
      cached.redis = connection
    }
  })
})
