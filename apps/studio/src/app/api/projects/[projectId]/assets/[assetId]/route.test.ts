import type * as ApiModule from "@checkout-studio/api"
import type { AssetDeletion } from "@checkout-studio/api"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The HTTP end of deleting an asset.
 *
 * Only what is true over HTTP and nowhere else: which status each refusal
 * becomes, and whether the sentence a merchant reads names the pages. The
 * decision itself is `deleteAsset`'s and is tested against a real database
 * there, so nothing here reaches one.
 */

const { deleteAsset, fileAsset } = vi.hoisted(() => ({ deleteAsset: vi.fn(), fileAsset: vi.fn() }))

vi.mock("@checkout-studio/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>()

  return { ...actual, authenticate: async () => ({ userId: "user_1" }), deleteAsset, fileAsset }
})

const { DELETE, PATCH } = await import("./route")

const PARAMS = { params: Promise.resolve({ projectId: "proj_abc12345", assetId: "ast_hero" }) }

function request(): Request {
  return new Request("http://localhost/api/projects/proj_abc12345/assets/ast_hero", {
    method: "DELETE",
  })
}

async function envelope(response: Response) {
  return (await response.json()) as {
    data: { deleted: boolean } | null
    error: {
      code: string
      message: string
      details?: readonly { path: string; message: string }[]
    } | null
  }
}

function answers(result: AssetDeletion): void {
  deleteAsset.mockResolvedValue(result)
}

beforeEach(() => {
  deleteAsset.mockReset()
  fileAsset.mockReset()
})

function patch(body: unknown): Request {
  return new Request("http://localhost/api/projects/proj_abc12345/assets/ast_hero", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("an asset that can go", () => {
  it("says it is deleted", async () => {
    answers({ ok: true })

    const response = await DELETE(request(), PARAMS)

    expect(response.status).toBe(200)
    expect((await envelope(response)).data).toEqual({ deleted: true })
  })

  it("asks about the asset in the project the URL names", async () => {
    // Both ids come from the path. An asset id alone would be an asset
    // somebody could delete from a project they are not looking at.
    answers({ ok: true })

    await DELETE(request(), PARAMS)

    expect(deleteAsset).toHaveBeenCalledWith(
      { userId: "user_1", projectId: "proj_abc12345" },
      "ast_hero",
    )
  })
})

describe("an asset a page still points at", () => {
  it("is a conflict rather than a refusal to try again later", async () => {
    answers({ ok: false, reason: "in-use", places: ["Checkout"] })

    expect((await DELETE(request(), PARAMS)).status).toBe(409)
  })

  it("names the pages, because that is what the merchant does next", async () => {
    /*
     * The half that makes the refusal worth having. "In use" leaves somebody
     * opening pages until they find it; "Checkout and Thank you" sends them
     * to two pages.
     */
    answers({ ok: false, reason: "in-use", places: ["Checkout", "Thank you (published)"] })

    const { error } = await envelope(await DELETE(request(), PARAMS))

    expect(error?.message).toContain("Checkout")
    expect(error?.message).toContain("Thank you (published)")
  })
})

describe("an asset that is not there", () => {
  it("is a 404", async () => {
    answers({ ok: false, reason: "not-found" })

    const response = await DELETE(request(), PARAMS)

    expect(response.status).toBe(404)
    expect((await envelope(response)).error?.code).toBe("ASSET_NOT_FOUND")
  })
})

describe("filing an asset", () => {
  it("answers with the folder it ended up in", async () => {
    // The one it ended up in, which is not always the one that was asked for:
    // the name is trimmed, and a spelling the project already uses wins.
    fileAsset.mockResolvedValue({ ok: true, folder: "Spring sale" })

    const response = await PATCH(patch({ folder: "  spring sale " }), PARAMS)

    expect(response.status).toBe(200)
    expect((await envelope(response)).data).toEqual({ folder: "Spring sale" })
  })

  it("takes null as unfiled", async () => {
    fileAsset.mockResolvedValue({ ok: true, folder: null })

    await PATCH(patch({ folder: null }), PARAMS)

    expect(fileAsset).toHaveBeenCalledWith(
      { userId: "user_1", projectId: "proj_abc12345" },
      "ast_hero",
      null,
    )
  })

  it("refuses a body that names no folder at all", async () => {
    /*
     * An omission is not "unfiled". A request that asked for nothing would
     * otherwise move an asset out of its folder because somebody sent an
     * empty object.
     */
    const response = await PATCH(patch({}), PARAMS)

    expect(response.status).toBe(422)
    expect(fileAsset).not.toHaveBeenCalled()
  })

  it("passes a refused name back as the sentence the service wrote", async () => {
    fileAsset.mockResolvedValue({
      ok: false,
      reason: "invalid",
      message: "Folders do not nest, so a name cannot contain a slash.",
    })

    /*
     * In `details` and not in the message. `invalidInput` says "check the
     * highlighted fields" and the per-field sentence travels beside it,
     * keyed by the field — which is what puts it under the input rather
     * than at the top of the panel.
     */
    const { error } = await envelope(await PATCH(patch({ folder: "a/b" }), PARAMS))

    expect(error?.details?.[0]).toMatchObject({
      path: "folder",
      message: "Folders do not nest, so a name cannot contain a slash.",
    })
  })

  it("is a 404 for an asset that is not there", async () => {
    fileAsset.mockResolvedValue({ ok: false, reason: "not-found" })

    expect((await PATCH(patch({ folder: "Spring" }), PARAMS)).status).toBe(404)
  })
})
