import type * as ApiModule from "@checkout-studio/api"
import type * as CacheModule from "@checkout-studio/cache"
import type * as ObservabilityModule from "@checkout-studio/observability"
import type { InstallOutcome } from "@checkout-studio/api"
import type { SchemaProblem } from "@checkout-studio/schema"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The HTTP end of installing a template.
 *
 * Only what is true over HTTP and nowhere else: which status each refusal
 * becomes, what a merchant is told, and what is deliberately not told. The
 * decision itself is `installTemplate`'s and is tested against a real
 * database there, so nothing here reaches one.
 */

const { installTemplate, error } = vi.hoisted(() => ({
  installTemplate: vi.fn(),
  error: vi.fn(),
}))

vi.mock("@checkout-studio/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>()

  return { ...actual, authenticate: async () => ({ userId: "user_1" }), installTemplate }
})

vi.mock("@checkout-studio/observability", async (importOriginal) => {
  const actual = await importOriginal<typeof ObservabilityModule>()

  return { ...actual, logger: { ...actual.logger, error } }
})

/*
 * The limiter is a real Redis counter keyed by scope, subject and window,
 * and an hour-long window outlives a test run. Left alone, running this file
 * enough times in an hour starts answering 429 — which is the limiter
 * working, and has nothing to do with what these tests ask. The limit itself
 * is `rateLimit`'s to get right and is tested where it lives.
 */
vi.mock("@checkout-studio/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof CacheModule>()

  return {
    ...actual,
    rateLimit: async () => ({ allowed: true, remaining: 1, retryAfter: 0 }),
  }
})

const { POST } = await import("./route")

const PARAMS = {
  params: Promise.resolve({ projectId: "proj_abc12345", templateId: "tpl_spring" }),
}

function request(): Request {
  return new Request("http://localhost/api/projects/proj_abc12345/templates/tpl_spring/install", {
    method: "POST",
  })
}

async function envelope(response: Response) {
  return (await response.json()) as {
    data: { page: { id: string; title: string; slug: string } } | null
    error: {
      code: string
      message: string
      details?: readonly { path: string; message: string }[]
    } | null
  }
}

function answers(result: InstallOutcome): void {
  installTemplate.mockResolvedValue(result)
}

beforeEach(() => {
  installTemplate.mockReset()
  error.mockReset()
})

describe("a template that installs", () => {
  it("answers with the page to open", async () => {
    answers({ ok: true, pageId: "pg_new", title: "Spring sale", slug: "spring-sale" })

    const response = await POST(request(), PARAMS)

    expect(response.status).toBe(200)
    expect((await envelope(response)).data).toEqual({
      page: { id: "pg_new", title: "Spring sale", slug: "spring-sale" },
    })
  })

  it("installs the template the URL names, into the project the URL names", async () => {
    answers({ ok: true, pageId: "pg_new", title: "Spring sale", slug: "spring-sale" })

    await POST(request(), PARAMS)

    expect(installTemplate).toHaveBeenCalledWith(
      { userId: "user_1", projectId: "proj_abc12345" },
      "tpl_spring",
    )
  })
})

describe("a template that is not there", () => {
  it("is a 404, and says nothing about whether it exists elsewhere", async () => {
    answers({ ok: false, reason: "not-found" })

    const response = await POST(request(), PARAMS)
    const body = await envelope(response)

    expect(response.status).toBe(404)
    expect(body.data).toBeNull()
    expect(body.error?.message).not.toContain("tpl_spring")
  })
})

describe("a template nobody can read", () => {
  const problems: readonly SchemaProblem[] = [
    {
      code: "missing-node",
      message: "The root points at a node that is not there.",
      nodeIds: ["nd_hero"],
      path: "root",
    },
  ]
  const unreadable: InstallOutcome = { ok: false, reason: "unreadable", problems }

  it("is a 422 naming the field, not the schema path inside it", async () => {
    answers(unreadable)

    const response = await POST(request(), PARAMS)
    const body = await envelope(response)

    expect(response.status).toBe(422)
    expect(body.error?.details?.[0]?.path).toBe("templateId")
    expect(JSON.stringify(body)).not.toContain("nd_hero")
  })

  it("tells somebody what happened without telling them to fix it", async () => {
    answers(unreadable)

    const message = (await envelope(await POST(request(), PARAMS))).error?.details?.[0]?.message

    expect(message).toBe("This template's content cannot be read, so it cannot be installed.")
  })

  it("logs which template it was and why, since that is where it gets fixed", async () => {
    answers(unreadable)

    await POST(request(), PARAMS)

    expect(error).toHaveBeenCalledWith("templates.install_unreadable", {
      templateId: "tpl_spring",
      problems,
    })
  })
})
