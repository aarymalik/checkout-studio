import { beforeEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { redis } from "@checkout-studio/cache"
import { Errors } from "@checkout-studio/utils"
import { route } from "../../src/middleware/chain"

const authed = async () => ({ userId: "user_1" })
const anonymous = async () => null

const request = (body?: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/v1/projects/proj_abc12345", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

beforeEach(async () => {
  await redis.flushdb()
})

describe("the response envelope", () => {
  it("wraps a success with data, a null error and a correlation id", async () => {
    const handler = route({ authenticate: authed }, async () => ({ id: "proj_1" }))

    const response = await handler(request())
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ success: true, data: { id: "proj_1" }, error: null })
    expect((body["meta"] as { correlationId: string }).correlationId).toMatch(/^req_/)
  })

  it("honours an inbound correlation id so a trace spans services", async () => {
    const handler = route({ authenticate: authed }, async () => ({}))

    const response = await handler(request(undefined, { "x-correlation-id": "req_upstream" }))

    expect(response.headers.get("x-correlation-id")).toBe("req_upstream")
  })

  it("returns the documented failure shape", async () => {
    const handler = route({ authenticate: authed }, async () => {
      throw Errors.resource.notFound("Project", "proj_1")
    })

    const response = await handler(request())
    const body = (await response.json()) as {
      success: boolean
      data: null
      error: { code: string }
    }

    expect(response.status).toBe(404)
    expect(body.success).toBe(false)
    expect(body.data).toBeNull()
    expect(body.error.code).toBe("PROJECT_NOT_FOUND")
  })
})

describe("authentication", () => {
  it("refuses an unauthenticated request", async () => {
    const handler = route({ authenticate: anonymous }, async () => ({}))

    const response = await handler(request())

    expect(response.status).toBe(401)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("UNAUTHORIZED")
  })

  it("allows an unauthenticated request to a public endpoint", async () => {
    const handler = route({ authenticate: anonymous, requireAuth: false }, async () => ({
      ok: true,
    }))

    expect((await handler(request())).status).toBe(200)
  })

  it("passes the caller's id to the handler", async () => {
    let seen: string | undefined
    const handler = route({ authenticate: authed }, async ({ userId }) => {
      seen = userId
      return {}
    })

    await handler(request())

    expect(seen).toBe("user_1")
  })
})

describe("validation", () => {
  const schema = z.object({ name: z.string().min(1), slug: z.string().min(1) })

  it("passes a valid body to the handler", async () => {
    const handler = route({ authenticate: authed, body: schema }, async ({ body }) => body)

    const response = await handler(request({ name: "A", slug: "a" }))

    expect(((await response.json()) as { data: unknown }).data).toEqual({ name: "A", slug: "a" })
  })

  it("rejects an invalid body with the field that failed", async () => {
    const handler = route({ authenticate: authed, body: schema }, async () => ({}))

    const response = await handler(request({ name: "" }))
    const body = (await response.json()) as {
      error: { code: string; details: Array<{ path: string }> }
    }

    expect(response.status).toBe(422)
    expect(body.error.code).toBe("VALIDATION_ERROR")
    expect(body.error.details.map((d) => d.path).sort()).toEqual(["name", "slug"])
  })

  it("rejects a malformed body rather than crashing", async () => {
    const handler = route({ authenticate: authed, body: schema }, async () => ({}))

    const bad = new Request("http://localhost/api/v1/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    })

    expect((await handler(bad)).status).toBe(422)
  })
})

describe("rate limiting", () => {
  const options = {
    authenticate: authed,
    rateLimit: { scope: "test.route", limit: 2, windowSeconds: 60 },
  }

  it("allows requests up to the limit", async () => {
    const handler = route(options, async () => ({}))

    expect((await handler(request())).status).toBe(200)
    expect((await handler(request())).status).toBe(200)
  })

  it("refuses beyond the limit and says when to retry", async () => {
    const handler = route(options, async () => ({}))

    await handler(request())
    await handler(request())
    const response = await handler(request())

    expect(response.status).toBe(429)
    expect(response.headers.get("retry-after")).toBeTruthy()
  })
})

describe("error sanitisation", () => {
  it("never returns an internal message or a stack", async () => {
    const handler = route({ authenticate: authed }, async () => {
      throw new Error('relation "User" does not exist at line 42')
    })

    const response = await handler(request())
    const raw = await response.text()

    expect(response.status).toBe(500)
    expect(raw).not.toContain("does not exist")
    expect(raw).not.toContain("line 42")
    expect(raw).toContain("Something went wrong")
  })

  it("keeps the correlation id on a failure, so the user can quote it", async () => {
    const handler = route({ authenticate: authed }, async () => {
      throw new Error("boom")
    })

    const response = await handler(request(undefined, { "x-correlation-id": "req_trace_me" }))

    expect(response.headers.get("x-correlation-id")).toBe("req_trace_me")
    expect(await response.text()).toContain("req_trace_me")
  })

  it("maps a thrown AppError to its own status", async () => {
    const handler = route({ authenticate: authed }, async () => {
      throw Errors.auth.forbidden("not the owner")
    })

    expect((await handler(request())).status).toBe(403)
  })
})
