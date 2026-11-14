import { describe, expect, it } from "vitest"
import { parseDocument, validateReferences } from "@checkout-studio/schema"
import type { CheckoutSchema, Node, PropValue } from "@checkout-studio/schema"

import { regenerateDocument } from "./regenerate"

/**
 * An imported page stopping being the page it was.
 *
 * Two failures to guard against, and they are opposite. A page that keeps an
 * id collides with what is already here; a page whose ids change without its
 * references following is a tree that no longer holds together. So most of
 * these assert the second half: that what comes out still describes itself.
 */

function node(id: string, overrides: Partial<Node> = {}): Node {
  return {
    id,
    type: "core.text",
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
    projectId: "redacted",
    pageId: "redacted",
    theme: { themeId: "theme_default" },
    settings,
    variables: {},
    root: "root",
    nodes: Object.fromEntries(nodes.map((entry) => [entry.id, entry])),
  }
}

const PAGE = document([
  node("root", { type: "core.page", children: ["hero", "copy"] }),
  node("hero", { type: "core.image", parentId: "root", props: { src: { $asset: "ast_old" } } }),
  node("copy", { parentId: "root" }),
])

/** Ids that are predictable, so a test can say what changed rather than that something did. */
function sequential(): RandomSourceLike {
  let step = 0

  return () => {
    step += 1

    return (step % 29) / 29
  }
}

type RandomSourceLike = () => number

const MAPPED = new Map([["ast_old", "ast_new"]])

describe("every node id", () => {
  it("is replaced", () => {
    const result = regenerateDocument(PAGE, MAPPED, new Set(), sequential())

    expect(result.ok).toBe(true)

    if (!result.ok) return

    expect(Object.keys(result.document.nodes)).toHaveLength(3)
    expect(Object.keys(result.document.nodes)).not.toContain("root")
    expect(Object.keys(result.document.nodes)).not.toContain("hero")
  })

  it("is recorded, so a report can say what became what", () => {
    const result = regenerateDocument(PAGE, MAPPED, new Set(), sequential())

    expect(result.ok ? [...result.nodes.keys()].sort() : []).toEqual(["copy", "hero", "root"])
  })

  it("carries the node's own id with it", () => {
    // A node stored under one id holding another is the `id-mismatch` the
    // schema has a name for.
    const result = regenerateDocument(PAGE, MAPPED, new Set(), sequential())

    if (!result.ok) throw new Error("Expected it to regenerate.")

    for (const [key, entry] of Object.entries(result.document.nodes)) {
      expect(entry.id).toBe(key)
    }
  })

  it("avoids an id the project already has", () => {
    /*
     * Imported content must never collide with existing content, and the
     * taken set is how a caller says what is spoken for.
     *
     * Blocked with the ids this very generator produces, from the same seed.
     * A set of invented ids would prove nothing: the generator was never
     * going to pick them, so the test would pass with the set ignored.
     */
    const first = regenerateDocument(PAGE, MAPPED, new Set(), sequential())

    if (!first.ok) throw new Error("Expected it to regenerate.")

    const claimed = new Set(Object.keys(first.document.nodes))
    const second = regenerateDocument(PAGE, MAPPED, claimed, sequential())

    if (!second.ok) throw new Error("Expected it to regenerate.")

    for (const id of Object.keys(second.document.nodes)) expect(claimed.has(id)).toBe(false)
  })
})

describe("the tree that comes out", () => {
  it("still holds together", () => {
    // The whole point. New ids with old references is a page with a parent
    // pointing at a node that no longer exists.
    const result = regenerateDocument(PAGE, MAPPED, new Set(), sequential())

    if (!result.ok) throw new Error("Expected it to regenerate.")

    expect(validateReferences(result.document)).toEqual([])
    expect(parseDocument(result.document).ok).toBe(true)
  })

  it("points root at the node root became", () => {
    const result = regenerateDocument(PAGE, MAPPED, new Set(), sequential())

    if (!result.ok) throw new Error("Expected it to regenerate.")

    expect(result.document.root).toBe(result.nodes.get("root"))
    expect(result.document.nodes[result.document.root]?.type).toBe("core.page")
  })

  it("keeps the shape: the same children in the same order", () => {
    const result = regenerateDocument(PAGE, MAPPED, new Set(), sequential())

    if (!result.ok) throw new Error("Expected it to regenerate.")

    const root = result.document.nodes[result.document.root] as Node

    expect(root.children).toEqual([result.nodes.get("hero"), result.nodes.get("copy")])
    expect(result.document.nodes[root.children[0] as string]?.parentId).toBe(result.document.root)
  })
})

describe("asset references", () => {
  it("point at the id reconciliation chose", () => {
    /*
     * Not regenerated here. Reconciliation already decided whether each asset
     * is an upload or a reuse of bytes this project holds, and inventing a
     * second answer would undo it.
     */
    const result = regenerateDocument(PAGE, MAPPED, new Set(), sequential())

    if (!result.ok) throw new Error("Expected it to regenerate.")

    const hero = result.document.nodes[result.nodes.get("hero") as string] as Node

    expect(hero.props["src"]).toEqual({ $asset: "ast_new" })
  })

  it("are followed into the places they hide", () => {
    const nested = document(
      [
        node("root", { type: "core.page", children: ["list"] }),
        node("list", {
          parentId: "root",
          props: { items: [{ icon: { $asset: "ast_old" } }] as unknown as PropValue },
        }),
      ],
      { favicon: { $asset: "ast_old" } },
    )
    const result = regenerateDocument(nested, MAPPED, new Set(), sequential())

    if (!result.ok) throw new Error("Expected it to regenerate.")

    expect(JSON.stringify(result.document)).not.toContain("ast_old")
    expect(result.document.settings.favicon).toEqual({ $asset: "ast_new" })
  })
})

describe("a reference nothing maps", () => {
  it("is a failure and not a silent drop", () => {
    /*
     * The rule the spec states outright. An unmapped reference means the
     * bundle names something it did not bring, and keeping the old id either
     * points at a stranger's row or at nothing at all.
     */
    const result = regenerateDocument(PAGE, new Map(), new Set(), sequential())

    expect(result).toMatchObject({ ok: false })
    expect(result.ok ? [] : result.unmapped).toEqual([
      { kind: "asset", id: "ast_old", at: "document" },
    ])
  })

  it("hands back no document at all", () => {
    expect("document" in regenerateDocument(PAGE, new Map(), new Set(), sequential())).toBe(false)
  })

  it("names a child that is not in the document", () => {
    const broken = document([node("root", { type: "core.page", children: ["gone"] })])
    const result = regenerateDocument(broken, MAPPED, new Set(), sequential())

    expect(result.ok ? [] : result.unmapped).toEqual([
      { kind: "node", id: "gone", at: "nodes.root.children[0]" },
    ])
  })

  it("names a parent that is not in the document", () => {
    const broken = document([
      node("root", { type: "core.page" }),
      node("stray", { parentId: "nowhere" }),
    ])
    const result = regenerateDocument(broken, MAPPED, new Set(), sequential())

    expect(result.ok ? [] : result.unmapped).toContainEqual({
      kind: "node",
      id: "nowhere",
      at: "nodes.stray.parentId",
    })
  })

  it("reports every one of them, not the first", () => {
    // One per attempt would mean one fix per attempt, and a bundle somebody
    // is repairing by hand is the only kind that gets here.
    const broken = document([node("root", { type: "core.page", children: ["gone", "also-gone"] })])

    expect(regenerateDocument(broken, MAPPED, new Set(), sequential())).toMatchObject({
      ok: false,
      unmapped: [{ id: "gone" }, { id: "also-gone" }],
    })
  })
})
