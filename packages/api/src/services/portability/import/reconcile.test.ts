import { describe, expect, it } from "vitest"
import type { StoredAsset } from "@checkout-studio/database"

import { reconcileAssets, reconcilePage } from "./reconcile"
import type { TargetProject } from "./reconcile"
import type { AssetRegistryEntry } from "../export/registry"

/**
 * What an import would do about what is already here.
 *
 * The question these answer is not "what is in the bundle" but "what does
 * this project already have", and the two ways of being wrong are opposite:
 * uploading a file the project already holds, and quietly overwriting a file
 * it holds that happens to share a name.
 */

function held(fileName: string, sha256: string): StoredAsset {
  return {
    id: `ast_${sha256}`,
    fileName,
    mimeType: "image/png",
    sizeBytes: 2_048,
    width: 800,
    height: 600,
    folder: null,
    storageKey: `assets/${sha256}.png`,
    url: `https://cdn.test/assets/${sha256}.png`,
    sha256: sha256.padEnd(64, "0"),
    renditions: [],
    createdAt: new Date("2026-11-14T00:00:00.000Z"),
  }
}

function arriving(fileName: string, sha256: string): AssetRegistryEntry {
  return {
    sourceId: `ast_source_${sha256}`,
    fileName,
    mimeType: "image/png",
    bytes: 2_048,
    sha256: sha256.padEnd(64, "0"),
    referencedBy: ["hero"],
  }
}

const EMPTY: TargetProject = { assets: [], slugsInUse: [] }

describe("a file the project already holds", () => {
  it("is reused rather than uploaded again", () => {
    // "Identical bytes are never stored twice." The same logo arriving in six
    // templates is one upload and five reuses.
    const target: TargetProject = { assets: [held("logo.png", "aaa")], slugsInUse: [] }

    expect(reconcileAssets([arriving("logo.png", "aaa")], target)).toEqual({
      actions: [{ type: "reuse-asset", assetId: "ast_aaa", reason: "identical-hash" }],
      conflicts: [],
    })
  })

  it("is matched on content and not on what it is called", () => {
    /*
     * The same picture, uploaded here under a different name. Matching on the
     * name would upload it again and leave the project holding two copies of
     * one file.
     */
    const target: TargetProject = { assets: [held("old-name.png", "aaa")], slugsInUse: [] }

    expect(reconcileAssets([arriving("hero.png", "aaa")], target).actions).toEqual([
      { type: "reuse-asset", assetId: "ast_aaa", reason: "identical-hash" },
    ])
  })

  it("asks about nothing, because there is nothing to decide", () => {
    const target: TargetProject = { assets: [held("logo.png", "aaa")], slugsInUse: [] }

    expect(reconcileAssets([arriving("logo.png", "aaa")], target).conflicts).toEqual([])
  })
})

describe("a file the project does not hold", () => {
  it("is uploaded", () => {
    expect(reconcileAssets([arriving("hero.png", "bbb")], EMPTY)).toEqual({
      actions: [{ type: "upload-asset", fileName: "hero.png", bytes: 2_048 }],
      conflicts: [],
    })
  })

  it("is a conflict when something else already answers to its name", () => {
    /*
     * Two different pictures both called hero.png. Both are real and both are
     * wanted, so which name each ends up with is a decision — and keeping
     * both is recommended because silently replacing a picture is the worst
     * of the four.
     */
    const target: TargetProject = { assets: [held("hero.png", "aaa")], slugsInUse: [] }
    const { actions, conflicts } = reconcileAssets([arriving("hero.png", "bbb")], target)

    expect(actions).toEqual([{ type: "upload-asset", fileName: "hero.png", bytes: 2_048 }])
    expect(conflicts).toEqual([
      {
        kind: "asset-name-collision",
        description: "This project already has a different file called hero.png.",
        options: ["keep-both", "rename", "replace", "skip"],
        recommended: "keep-both",
      },
    ])
  })
})

describe("several files at once", () => {
  it("are answered one by one, in the order they arrived", () => {
    const target: TargetProject = { assets: [held("logo.png", "aaa")], slugsInUse: [] }
    const { actions } = reconcileAssets(
      [arriving("hero.png", "bbb"), arriving("logo.png", "aaa"), arriving("icon.png", "ccc")],
      target,
    )

    expect(actions.map((action) => action.type)).toEqual([
      "upload-asset",
      "reuse-asset",
      "upload-asset",
    ])
  })

  it("are nothing at all when the bundle carries none", () => {
    expect(reconcileAssets([], EMPTY)).toEqual({ actions: [], conflicts: [] })
  })
})

describe("the page itself", () => {
  it("is created when nothing is in its way", () => {
    expect(reconcilePage("checkout", "Checkout", EMPTY)).toEqual({
      actions: [{ type: "create-page", name: "Checkout" }],
      conflicts: [],
    })
  })

  it("is a conflict when the project already has a page at that address", () => {
    const target: TargetProject = { assets: [], slugsInUse: ["checkout", "thanks"] }

    expect(reconcilePage("checkout", "Checkout", target).conflicts).toEqual([
      {
        kind: "duplicate-page-slug",
        description: "This project already has a page at /checkout.",
        options: ["rename", "replace", "skip"],
        recommended: "rename",
      },
    ])
  })

  it("does not offer to keep both, because two pages cannot share a URL", () => {
    /*
     * The one resolution that is meaningless here. A slug is a live page's
     * address and the index is unique on it, so "keep both" would be an
     * option that cannot be carried out.
     */
    const target: TargetProject = { assets: [], slugsInUse: ["checkout"] }

    expect(reconcilePage("checkout", "Checkout", target).conflicts[0]?.options).not.toContain(
      "keep-both",
    )
  })

  it("is still created, because a conflict is a decision and not a refusal", () => {
    const target: TargetProject = { assets: [], slugsInUse: ["checkout"] }

    expect(reconcilePage("checkout", "Checkout", target).actions).toEqual([
      { type: "create-page", name: "Checkout" },
    ])
  })

  it("is unbothered by a slug belonging to a page that is not this one", () => {
    const target: TargetProject = { assets: [], slugsInUse: ["thanks"] }

    expect(reconcilePage("checkout", "Checkout", target).conflicts).toEqual([])
  })
})
