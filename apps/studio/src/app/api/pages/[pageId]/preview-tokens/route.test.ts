import type * as ApiModule from "@checkout-studio/api"
import type { PreviewIssue } from "@checkout-studio/api"
import type * as CacheModule from "@checkout-studio/cache"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Links that show a draft to somebody who cannot sign in.
 *
 * Only what is true over HTTP. The one thing decided here is the URL: the
 * service hands back a secret, and what a merchant needs is something
 * they can paste into a message.
 */

const { issuePreview, listPreviews } = vi.hoisted(() => ({
  issuePreview: vi.fn(),
  listPreviews: vi.fn(),
}))

vi.mock("@checkout-studio/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>()

  return {
    ...actual,
    authenticate: async () => ({ userId: "user_1" }),
    issuePreview,
    listPreviews,
  }
})

vi.mock("@checkout-studio/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof CacheModule>()

  return { ...actual, rateLimit: async () => ({ allowed: true, remaining: 1, retryAfter: 0 }) }
})

const { GET, POST } = await import("./route")

const PARAMS = { params: Promise.resolve({ pageId: "pag_1" }) }
const EXPIRES = new Date("2026-02-01T00:00:00.000Z")

function post(body: unknown = {}): Request {
  return new Request("http://localhost/api/pages/pag_1/preview-tokens", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function envelope(response: Response) {
  return (await response.json()) as { data: Record<string, unknown> | null; error: unknown }
}

beforeEach(() => {
  issuePreview.mockReset()
  listPreviews.mockReset()
  listPreviews.mockResolvedValue([])
})

function issues(result: PreviewIssue): void {
  issuePreview.mockResolvedValue(result)
}

describe("making a link", () => {
  it("answers with something a merchant can paste", async () => {
    issues({ ok: true, preview: { id: "pvt_1", token: "a-secret", expiresAt: EXPIRES } })

    const body = await envelope(await POST(post(), PARAMS))
    const link = body.data?.["link"] as { url: string; id: string }

    /*
     * The same origin the embed snippet names, because it is the same
     * renderer. A secret alone is not something anybody can use.
     */
    expect(link.url).toMatch(/^https?:\/\/.+\/preview\/a-secret$/u)
    expect(link.id).toBe("pvt_1")
  })

  it("escapes the secret into the path", async () => {
    issues({ ok: true, preview: { id: "pvt_1", token: "a/b+c", expiresAt: EXPIRES } })

    const body = await envelope(await POST(post(), PARAMS))
    const link = body.data?.["link"] as { url: string }

    // base64url happens to be path-safe; the encoding is not conditional
    // on today's alphabet still being so tomorrow.
    expect(link.url).toContain("a%2Fb%2Bc")
  })

  it("passes a requested lifetime through", async () => {
    issues({ ok: true, preview: { id: "pvt_1", token: "s", expiresAt: EXPIRES } })

    await POST(post({ hours: 12 }), PARAMS)

    expect(issuePreview).toHaveBeenCalledWith(
      { userId: "user_1" },
      expect.objectContaining({ pageId: "pag_1", hours: 12 }),
    )
  })

  it("asks for no lifetime when none was given", async () => {
    issues({ ok: true, preview: { id: "pvt_1", token: "s", expiresAt: EXPIRES } })

    await POST(post(), PARAMS)

    // The default belongs to the service, so sending an undefined hours
    // would be this route having an opinion it does not hold.
    const [, input] = issuePreview.mock.calls[0] as [unknown, Record<string, unknown>]

    expect(input).not.toHaveProperty("hours")
  })

  it("refuses a lifetime that is not a positive whole number", async () => {
    const response = await POST(post({ hours: -3 }), PARAMS)

    expect(response.status).toBe(422)
    expect(issuePreview).not.toHaveBeenCalled()
  })

  it("is a 404 for a page this caller does not own", async () => {
    issues({ ok: false, reason: "not-found" })

    expect((await POST(post(), PARAMS)).status).toBe(404)
  })
})

describe("listing links", () => {
  it("says when each was made and whether it still works", async () => {
    listPreviews.mockResolvedValue([
      { id: "pvt_1", expiresAt: EXPIRES, revokedAt: null, createdAt: EXPIRES },
    ])

    const body = await envelope(
      await GET(new Request("http://localhost/api/pages/pag_1/preview-tokens"), PARAMS),
    )

    /*
     * And cannot say what any of their URLs are: the secret is in the
     * answer to making one and nowhere else.
     */
    expect(JSON.stringify(body.data)).not.toContain("token")
    expect(listPreviews).toHaveBeenCalledWith({ userId: "user_1" }, "pag_1")
  })
})
