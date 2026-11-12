import { describe, expect, it } from "vitest"
import type { CheckoutSchema, Node } from "@checkout-studio/schema"
import type { StoredAsset } from "@checkout-studio/database"

import { assetRegistry } from "./registry"

/**
 * The table of files a bundle carries.
 *
 * Which nodes point at what is proved in the schema package, where the walk
 * lives. What is proved here is the row: that it carries what an importer
 * deduplicates against, that a dimension nothing measured is absent rather
 * than null, and that a reference to something the library no longer holds is
 * said out loud.
 */

function node(id: string, overrides: Partial<Node> = {}): Node {
  return {
    id,
    type: "core.image",
    parentId: null,
    children: [],
    props: {},
    styles: {},
    visibility: { hidden: false },
    animations: [],
    metadata: { locked: false },
    ...overrides,
  }
}

function document(
  nodes: readonly Node[],
  settings: CheckoutSchema["settings"] = {},
): CheckoutSchema {
  return {
    version: "1.0.0",
    projectId: "prj_test",
    pageId: "pag_test",
    theme: { themeId: "theme_test" },
    settings,
    variables: {},
    root: "root",
    nodes: Object.fromEntries(nodes.map((entry) => [entry.id, entry])),
  }
}

function asset(id: string, overrides: Partial<StoredAsset> = {}): StoredAsset {
  return {
    id,
    fileName: `${id}.png`,
    mimeType: "image/png",
    sizeBytes: 2_048,
    width: 800,
    height: 600,
    folder: null,
    storageKey: `assets/${id}.png`,
    url: `https://cdn.test/assets/${id}.png`,
    sha256: id.padEnd(64, "0"),
    renditions: [],
    createdAt: new Date("2026-11-12T00:00:00.000Z"),
    ...overrides,
  }
}

const PAGE = document(
  [
    node("root", { type: "core.page", children: ["hero"] }),
    node("hero", { parentId: "root", props: { src: { $asset: "ast_hero" } } }),
  ],
  { favicon: { $asset: "ast_icon" } },
)

describe("a row in the registry", () => {
  it("says what the file is and what it was called here", () => {
    const { entries } = assetRegistry(PAGE, [asset("ast_hero"), asset("ast_icon")])

    expect(entries[0]).toEqual({
      sourceId: "ast_hero",
      url: "https://cdn.test/assets/ast_hero.png",
      fileName: "ast_hero.png",
      mimeType: "image/png",
      bytes: 2_048,
      width: 800,
      height: 600,
      sha256: "ast_hero".padEnd(64, "0"),
      referencedBy: ["hero"],
    })
  })

  it("leaves out a dimension nothing measured", () => {
    // A PDF has no width. An explicit null in a bundle is a reader wondering
    // whether zero was meant.
    const flat = asset("ast_hero", { width: null, height: null, mimeType: "application/pdf" })
    const { entries } = assetRegistry(PAGE, [flat, asset("ast_icon")])

    expect(entries[0]).not.toHaveProperty("width")
    expect(entries[0]).not.toHaveProperty("height")
  })

  it("records nothing for an asset only the settings name", () => {
    const { entries } = assetRegistry(PAGE, [asset("ast_hero"), asset("ast_icon")])

    expect(entries.find((entry) => entry.sourceId === "ast_icon")?.referencedBy).toEqual([])
  })
})

describe("the order", () => {
  it("is by asset id and not by where the tree reached them", () => {
    /*
     * The registry is inside the payload the checksum covers, so a page where
     * a node moved would otherwise export as a different file.
     */
    const page = document([
      node("root", { type: "core.page", children: ["second", "first"] }),
      node("second", { parentId: "root", props: { src: { $asset: "ast_z" } } }),
      node("first", { parentId: "root", props: { src: { $asset: "ast_a" } } }),
    ])

    expect(
      assetRegistry(page, [asset("ast_z"), asset("ast_a")]).entries.map((e) => e.sourceId),
    ).toEqual(["ast_a", "ast_z"])
  })
})

describe("an asset the library no longer holds", () => {
  it("is named rather than skipped", () => {
    // A bundle that imports cleanly and renders a missing picture tells
    // nobody why, which is the same failure as an unprovided component type.
    const { entries, missing } = assetRegistry(PAGE, [asset("ast_hero")])

    expect(missing).toEqual(["ast_icon"])
    expect(entries.map((entry) => entry.sourceId)).toEqual(["ast_hero"])
  })

  it("does not stop the ones that are there", () => {
    expect(assetRegistry(PAGE, []).entries).toEqual([])
    expect(assetRegistry(PAGE, []).missing).toEqual(["ast_hero", "ast_icon"])
  })
})

describe("a page naming no assets", () => {
  it("has an empty registry rather than every asset in the library", () => {
    // The library is the project's; the registry is the page's.
    const bare = document([node("root", { type: "core.page" })])

    expect(assetRegistry(bare, [asset("ast_hero")])).toEqual({ entries: [], missing: [] })
  })
})
