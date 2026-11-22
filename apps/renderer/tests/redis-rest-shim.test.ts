import { writeEmbedOrigins } from "@checkout-studio/cache"
import { Redis } from "@upstash/redis"
import type { Server } from "node:http"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { getEnv } from "../src/env"

// @ts-expect-error -- development tooling, authored as plain ESM with no types.
import { createShim } from "../../../scripts/redis-rest-shim.mjs"

/**
 * That the proxy's client can read what the application writes.
 *
 * Two clients, two protocols, one Redis: the application writes the embed
 * allowlist with ioredis over a socket, and the proxy reads it with
 * `@upstash/redis` over HTTP. Nothing else in the test suite puts those two
 * on the same key, and a mismatch between them is a `frame-ancestors`
 * header built from nothing.
 *
 * The real client is used deliberately. A fake would prove the shim answers
 * what I assumed it asks for; this proves it answers what it does ask for —
 * the base64 encoding it requests by default included.
 */

const TOKEN = "test-token"

let server: Server
let redis: Redis

beforeAll(async () => {
  // Through the app's validated env, which is where this app reads
  // configuration from — the lint rule applies to tests as much as to src.
  server = createShim({ redisUrl: getEnv().REDIS_URL, token: TOKEN }) as Server

  await new Promise<void>((resolve) => server.listen(0, resolve))

  const address = server.address()
  const port = typeof address === "object" && address !== null ? address.port : 0

  redis = new Redis({ url: `http://localhost:${String(port)}`, token: TOKEN })
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

const key = (name: string): string => `cs:shim-test:${name}:${String(Date.now())}`

describe("the proxy's client against a local Redis", () => {
  it("reads back a string the way it was written", async () => {
    const name = key("plain")

    await redis.set(name, "hello")

    expect(await redis.get(name)).toBe("hello")
  })

  it("reads the allowlist the application wrote with the other client", async () => {
    /*
     * The case this file exists for. `writeEmbedOrigins` goes over a socket
     * with ioredis; this read comes back over HTTP with the client the proxy
     * uses, and the two have to agree on the bytes.
     */
    const pageId = `pg_shim_${String(Date.now())}`

    await writeEmbedOrigins(pageId, ["https://a.example", "https://b.example"])

    expect(await redis.get(`cs:embed-origins:${pageId}`)).toEqual([
      "https://a.example",
      "https://b.example",
    ])
  })

  it("answers null for a key that is not there", async () => {
    // A miss is how the proxy learns a page has no copy, so it must not
    // arrive as a thrown error or an empty string.
    expect(await redis.get(key("missing"))).toBeNull()
  })

  it("deletes", async () => {
    const name = key("doomed")

    await redis.set(name, "x")
    await redis.del(name)

    expect(await redis.get(name)).toBeNull()
  })

  it("refuses a request without the token", async () => {
    const address = server.address()
    const port = typeof address === "object" && address !== null ? address.port : 0
    const response = await fetch(`http://localhost:${String(port)}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer wrong" },
      body: JSON.stringify(["get", "anything"]),
    })

    expect(response.status).toBe(401)
  })
})
