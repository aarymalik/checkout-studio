import type * as ApiModule from "@checkout-studio/api"
import type { RestoreOutcome, RollbackOutcome } from "@checkout-studio/api"
import type * as CacheModule from "@checkout-studio/cache"
import { DraftConflictError } from "@checkout-studio/database"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Going back to one revision.
 *
 * Only what is true over HTTP: which status each outcome becomes, and —
 * the one worth the file — that losing a race with another editor is an
 * answer a client can act on rather than a five hundred.
 */

const { restoreRevision, rollbackPage } = vi.hoisted(() => ({
  restoreRevision: vi.fn(),
  rollbackPage: vi.fn(),
}))

vi.mock("@checkout-studio/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>()

  return {
    ...actual,
    authenticate: async () => ({ userId: "user_1" }),
    restoreRevision,
    rollbackPage,
  }
})

vi.mock("@checkout-studio/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof CacheModule>()

  return { ...actual, rateLimit: async () => ({ allowed: true, remaining: 1, retryAfter: 0 }) }
})

const { PATCH, PUT } = await import("./route")

const PARAMS = { params: Promise.resolve({ pageId: "pag_1", revisionId: "rev_1" }) }

function request(method: "PATCH" | "PUT", body: unknown = { baseVersion: 3 }): Request {
  return new Request("http://localhost/api/pages/pag_1/revisions/rev_1", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function envelope(response: Response) {
  return (await response.json()) as {
    data: Record<string, unknown> | null
    error: {
      code: string
      message: string
      details?: readonly { path: string; code: string; message: string }[]
    } | null
  }
}

beforeEach(() => {
  restoreRevision.mockReset()
  rollbackPage.mockReset()
})

describe("restoring into the draft", () => {
  it("answers with the version the draft moved to", async () => {
    restoreRevision.mockResolvedValue({ ok: true, draftVersion: 4 } satisfies RestoreOutcome)

    const response = await PATCH(request("PATCH"), PARAMS)

    expect(response.status).toBe(200)
    expect((await envelope(response)).data).toEqual({ draftVersion: 4 })
    expect(restoreRevision).toHaveBeenCalledWith(
      { userId: "user_1" },
      { pageId: "pag_1", revisionId: "rev_1", baseVersion: 3 },
    )
  })

  it("is a 409 when another editor got there first", async () => {
    restoreRevision.mockRejectedValue(new DraftConflictError(3, 7))

    const response = await PATCH(request("PATCH"), PARAMS)
    const body = await envelope(response)

    /*
     * The collision any save can lose. A five hundred would tell a client
     * nothing to do; this names the version that won, which is what turns
     * a refusal into an instruction.
     */
    expect(response.status).toBe(409)
    expect(body.error?.code).toBe("DRAFT_CONFLICT")
    expect(body.error?.details?.[0]).toMatchObject({
      path: "baseVersion",
      message: "The draft is now at version 7.",
    })
  })

  it("does not dress an ordinary fault up as a conflict", async () => {
    restoreRevision.mockRejectedValue(new Error("the database fell over"))

    const response = await PATCH(request("PATCH"), PARAMS)
    const body = await envelope(response)

    /*
     * Only a lost race is a conflict. Anything else reported as one would
     * tell a merchant to reload over a fault that reloading cannot fix,
     * and would hide a real failure behind a reassuring message.
     */
    expect(response.status).toBe(500)
    expect(body.error?.code).not.toBe("DRAFT_CONFLICT")
  })

  it("is a 404 for a revision that is not this page's", async () => {
    restoreRevision.mockResolvedValue({ ok: false, reason: "not-found" } satisfies RestoreOutcome)

    expect((await PATCH(request("PATCH"), PARAMS)).status).toBe(404)
  })

  it("refuses a revision this release cannot read, against the field", async () => {
    restoreRevision.mockResolvedValue({ ok: false, reason: "unreadable" } satisfies RestoreOutcome)

    const body = await envelope(await PATCH(request("PATCH"), PARAMS))

    expect(body.error?.details?.[0]?.path).toBe("revisionId")
  })

  it("refuses a body with no version in it", async () => {
    const response = await PATCH(request("PATCH", {}), PARAMS)

    // Without it the restore would clobber whatever the draft had become.
    expect(response.status).toBe(422)
    expect(restoreRevision).not.toHaveBeenCalled()
  })
})

describe("rolling back", () => {
  it("answers with the revision it published", async () => {
    rollbackPage.mockResolvedValue({
      ok: true,
      revisionId: "rev_new",
      revisionNumber: 5,
      created: true,
      warnings: [],
    } satisfies RollbackOutcome)

    const body = await envelope(await PUT(request("PUT"), PARAMS))

    expect(body.data).toMatchObject({ revision: { id: "rev_new", number: 5 }, created: true })
  })

  it("says when the page was already serving that version", async () => {
    rollbackPage.mockResolvedValue({
      ok: true,
      revisionId: "rev_1",
      revisionNumber: 2,
      created: false,
      warnings: [],
    } satisfies RollbackOutcome)

    // Asserted separately from the created case, because a route that
    // hardcoded either would pass a test that only tried the other.
    expect((await envelope(await PUT(request("PUT"), PARAMS))).data).toMatchObject({
      created: false,
    })
  })

  it("runs this installation's rules", async () => {
    rollbackPage.mockResolvedValue({
      ok: true,
      revisionId: "rev_new",
      revisionNumber: 5,
      created: true,
      warnings: [],
    } satisfies RollbackOutcome)

    await PUT(request("PUT"), PARAMS)

    const [, input] = rollbackPage.mock.calls[0] as [unknown, { validators: unknown[] }]

    expect(input.validators.length).toBeGreaterThan(0)
  })

  it("reports what today's rules refused, against the nodes", async () => {
    rollbackPage.mockResolvedValue({
      ok: false,
      reason: "blocked",
      issues: [
        {
          rule: "engine.missing-asset",
          severity: "error",
          message: "This draws an image the project no longer has.",
          nodeIds: ["nd_hero"],
        },
      ],
    } satisfies RollbackOutcome)

    const response = await PUT(request("PUT"), PARAMS)
    const body = await envelope(response)

    /*
     * The content is in the draft to be fixed, so these are the same
     * field-level problems a publish reports, about the same nodes.
     */
    expect(response.status).toBe(422)
    expect(body.error?.details?.[0]).toMatchObject({
      path: "nd_hero",
      code: "engine.missing-asset",
    })
  })

  it("is a 409 when another editor got there first", async () => {
    rollbackPage.mockRejectedValue(new DraftConflictError(3, 9))

    expect((await PUT(request("PUT"), PARAMS)).status).toBe(409)
  })
})
