import { createServer } from "node:http"

import Redis from "ioredis"

/**
 * Upstash's REST protocol, spoken by a local Redis.
 *
 * Development tooling. Nothing in the product imports this, and it must
 * never be deployed.
 *
 * The renderer's proxy reads the embed allowlist with `@upstash/redis`,
 * which speaks HTTP because Next's Proxy may be deployed apart from the
 * application and must not hold a socket. In production that HTTP endpoint
 * is Upstash's. Locally and in CI there is a plain Redis on a TCP port and
 * nothing listening for HTTP at all, so this stands in.
 *
 * A container image exists for this job. It is not used because it needs
 * Docker, which this project does not otherwise require — a developer has
 * Postgres and Redis and that has been enough. Eighty lines of Node keeps
 * it that way, and runs identically in CI.
 *
 * ## The protocol, as the client actually speaks it
 *
 * Read out of `@upstash/redis@1.35.7` rather than from documentation:
 *
 * ```
 * POST <base url>              body ["get", "key"]
 * POST <base url>/pipeline     body [["get","a"], ["get","b"]]
 * authorization: Bearer <token>
 * ```
 *
 * The answer is `{"result": …}`, or `{"error": …}` with a 4xx. The client
 * sends `Upstash-Encoding: base64` by default and base64-decodes every
 * string it gets back — except the literal `OK`, which it compares before
 * decoding. So `OK` goes back as itself and everything else is encoded.
 */

const OK = "OK"

/** Base64 where the client expects it, and `OK` left alone as it requires. */
function encode(value, base64) {
  if (!base64 || value === null || value === OK) return value
  if (Array.isArray(value)) return value.map((item) => encode(item, base64))
  if (typeof value === "string") return Buffer.from(value, "utf8").toString("base64")

  return value
}

async function run(redis, command) {
  if (!Array.isArray(command) || command.length === 0 || typeof command[0] !== "string") {
    throw new Error("a command must be an array beginning with its name")
  }

  const [name, ...args] = command

  return redis.call(name, ...args.map((arg) => (typeof arg === "string" ? arg : String(arg))))
}

/**
 * An HTTP server speaking that protocol against `redisUrl`.
 *
 * Returned unlistened, so a test can bind port 0 and a script can bind the
 * port a developer configured.
 */
export function createShim({ redisUrl, token }) {
  const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 })

  const server = createServer((request, response) => {
    const chunks = []

    request.on("data", (chunk) => chunks.push(chunk))
    request.on("end", () => {
      void (async () => {
        const send = (status, body) => {
          response.writeHead(status, { "content-type": "application/json" })
          response.end(JSON.stringify(body))
        }

        /*
         * A GET is a readiness probe and needs no token. Playwright starts
         * this as a web server and waits for the URL to answer; the real
         * protocol is POST only, so nothing is loosened by it.
         */
        if (request.method === "GET") return send(200, { result: "PONG" })

        if (request.headers.authorization !== `Bearer ${token}`) {
          return send(401, { error: "Unauthorized" })
        }

        const base64 = request.headers["upstash-encoding"] === "base64"

        try {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "null")
          const pipeline = request.url?.endsWith("/pipeline") === true

          if (pipeline) {
            const results = []

            for (const command of body) {
              results.push({ result: encode(await run(redis, command), base64) })
            }

            return send(200, results)
          }

          return send(200, { result: encode(await run(redis, body), base64) })
        } catch (error) {
          return send(400, { error: error instanceof Error ? error.message : "failed" })
        }
      })()
    })
  })

  server.on("close", () => {
    redis.disconnect()
  })

  return server
}

/** Run directly: `node scripts/redis-rest-shim.mjs`. */
if (process.argv[1]?.endsWith("redis-rest-shim.mjs") === true) {
  /*
   * The port the applications are configured to call, so there is one source
   * of truth for it rather than a default here that can drift from the URL
   * in the environment.
   */
  const configured = process.env["UPSTASH_REDIS_REST_URL"]
  const port = Number(configured === undefined ? 8079 : new URL(configured).port || 80)
  const server = createShim({
    redisUrl: process.env["REDIS_URL"] ?? "redis://localhost:6379",
    token: process.env["UPSTASH_REDIS_REST_TOKEN"] ?? "local-development-token",
  })

  server.listen(port, () => {
    process.stdout.write(`Upstash-compatible REST shim on http://localhost:${String(port)}\n`)
  })
}
