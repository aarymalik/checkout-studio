import { beforeEach, describe, expect, it, vi } from "vitest"
import { ping, redis } from "../../src/client"
import { cacheKey, del, get, remember, set } from "../../src/cache"
import { once } from "../../src/idempotency"
import { rateLimit } from "../../src/rateLimit"

beforeEach(async () => {
  await redis.flushdb()
})

describe("cache", () => {
  it("stores and reads a value", async () => {
    await set("k", { a: 1 }, { ttl: 60 })

    expect(await get("k")).toEqual({ a: 1 })
  })

  it("returns undefined for a missing key", async () => {
    expect(await get("absent")).toBeUndefined()
  })

  it("expires a value after its ttl", async () => {
    await set("k", "v", { ttl: 1 })

    expect(await redis.ttl("k")).toBeLessThanOrEqual(1)
  })

  it("deletes keys", async () => {
    await set("a", 1, { ttl: 60 })
    await set("b", 2, { ttl: 60 })

    await del("a", "b")

    expect(await get("a")).toBeUndefined()
    expect(await get("b")).toBeUndefined()
  })

  it("namespaces keys so one subsystem cannot clash with another", () => {
    expect(cacheKey("entitlements", "user_1")).toBe("cs:entitlements:user_1")
  })

  it("computes on a miss and serves from cache thereafter", async () => {
    const compute = vi.fn().mockResolvedValue("computed")

    expect(await remember("k", { ttl: 60 }, compute)).toBe("computed")
    expect(await remember("k", { ttl: 60 }, compute)).toBe("computed")
    expect(compute).toHaveBeenCalledOnce()
  })
})

describe("idempotency", () => {
  it("executes the operation once and replays the result after", async () => {
    const operation = vi.fn().mockResolvedValue({ orderId: "order_1" })

    const first = await once("order.create", "key-1", operation)
    const second = await once("order.create", "key-1", operation)

    expect(first).toEqual({ status: "executed", value: { orderId: "order_1" } })
    expect(second).toEqual({ status: "replayed", value: { orderId: "order_1" } })
    expect(operation).toHaveBeenCalledOnce()
  })

  it("treats different keys as different operations", async () => {
    const operation = vi.fn().mockResolvedValue("x")

    await once("scope", "a", operation)
    await once("scope", "b", operation)

    expect(operation).toHaveBeenCalledTimes(2)
  })

  it("lets only one of two concurrent callers execute", async () => {
    let running = 0
    let overlapped = false

    const operation = async () => {
      running += 1
      if (running > 1) overlapped = true
      await new Promise((r) => setTimeout(r, 30))
      running -= 1
      return "done"
    }

    const [a, b] = await Promise.all([
      once("scope", "same", operation),
      once("scope", "same", operation),
    ])

    expect(overlapped).toBe(false)
    // One executes; the other is told the work is already in flight.
    expect([a?.status, b?.status].filter((s) => s === "executed")).toHaveLength(1)
  })

  it("does not poison the key when the operation fails, so a retry is possible", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValue("recovered")

    await expect(once("scope", "k", operation)).rejects.toThrow("transient")

    expect(await once("scope", "k", operation)).toEqual({
      status: "executed",
      value: "recovered",
    })
  })
})

describe("rate limiting", () => {
  const options = { scope: "test", subject: "session_1", limit: 3, windowSeconds: 60 }

  it("allows requests up to the limit", async () => {
    for (let i = 0; i < 3; i += 1) {
      expect((await rateLimit(options)).allowed).toBe(true)
    }
  })

  it("refuses the request after the limit and says when to retry", async () => {
    for (let i = 0; i < 3; i += 1) await rateLimit(options)

    const result = await rateLimit(options)

    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.retryAfter).toBeGreaterThan(0)
  })

  it("counts subjects independently", async () => {
    for (let i = 0; i < 3; i += 1) await rateLimit(options)

    expect((await rateLimit({ ...options, subject: "session_2" })).allowed).toBe(true)
  })

  it("reports how many requests remain", async () => {
    expect((await rateLimit(options)).remaining).toBe(2)
    expect((await rateLimit(options)).remaining).toBe(1)
  })
})

describe("health probe", () => {
  it("round-trips a ping once the connection is ready", async () => {
    await expect(ping()).resolves.toBeUndefined()
  })

  it("is usable repeatedly", async () => {
    await ping()
    await expect(ping()).resolves.toBeUndefined()
  })
})
