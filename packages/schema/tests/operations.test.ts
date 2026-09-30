import { describe, expect, it } from "vitest"

import { duplicate, insert, move, remove, unwrap, update, wrap } from "../src/tree/operations"
import { createNode, extract, regenerateIds } from "../src/tree/fragment"
import { collect, subtreeIds } from "../src/tree/traverse"
import { validateReferences } from "../src/document/validate"
import type { Node } from "../src/document/schema"
import { makeNode, sampleDocument, sequentialRandom } from "./support"

/**
 * The tree operations.
 *
 * Two properties are asserted everywhere rather than in one place: the input is
 * never touched, and the result is a valid tree. History stores what these
 * return, so a mutation rewrites the past, and a caller has no way to notice an
 * operation that leaves the document subtly wrong.
 */

/** Nothing any operation produces may be an invalid tree. */
function expectValid(document: Parameters<typeof validateReferences>[0]): void {
  expect(validateReferences(document)).toEqual([])
}

/** The new id a successful duplicate reports. */
function duplicatedId(result: ReturnType<typeof duplicate>): string {
  expect(result.ok, result.ok ? "" : result.message).toBe(true)

  return (result as { ok: true; newId: string }).newId
}

function ok(result: ReturnType<typeof insert>) {
  expect(result.ok, "ok" in result && !result.ok ? result.message : "").toBe(true)

  return (result as { ok: true; document: ReturnType<typeof sampleDocument> }).document
}

describe("insert", () => {
  const fresh = (id = "new") => ({
    rootId: id,
    nodes: { [id]: makeNode(id, { type: "core.text" }) },
  })

  it("puts a node into an empty parent", () => {
    const document = ok(insert(sampleDocument(), fresh(), "footer"))

    expect(document.nodes["footer"]?.children).toEqual(["new"])
    expect(document.nodes["new"]?.parentId).toBe("footer")
    expectValid(document)
  })

  it("inserts at index 0", () => {
    const document = ok(insert(sampleDocument(), fresh(), "section", 0))

    expect(document.nodes["section"]?.children).toEqual(["new", "heading", "text"])
  })

  it("inserts at the end", () => {
    const document = ok(insert(sampleDocument(), fresh(), "section", 2))

    expect(document.nodes["section"]?.children).toEqual(["heading", "text", "new"])
  })

  it("clamps an index beyond the end", () => {
    const document = ok(insert(sampleDocument(), fresh(), "section", 99))

    expect(document.nodes["section"]?.children).toEqual(["heading", "text", "new"])
  })

  it("clamps a negative index to the start", () => {
    const document = ok(insert(sampleDocument(), fresh(), "section", -5))

    expect(document.nodes["section"]?.children).toEqual(["new", "heading", "text"])
  })

  // A computed index can arrive as NaN, and splice at NaN silently inserts at 0.
  it("treats an index of NaN as the end", () => {
    const document = ok(insert(sampleDocument(), fresh(), "section", Number.NaN))

    expect(document.nodes["section"]?.children).toEqual(["heading", "text", "new"])
  })

  it("appends when no index is given", () => {
    const document = ok(insert(sampleDocument(), fresh(), "section"))

    expect(document.nodes["section"]?.children).toEqual(["heading", "text", "new"])
  })

  // The engine has no opinion about which components take children; the caller
  // supplies the rule.
  it("refuses a parent that does not take children", () => {
    const result = insert(sampleDocument(), fresh(), "heading", 0, {
      canHaveChildren: (node) => node.type !== "core.heading",
    })

    expect(result).toMatchObject({ ok: false, code: "rejects-children", nodeIds: ["heading"] })
  })

  it("refuses a parent that is not there", () => {
    expect(insert(sampleDocument(), fresh(), "nowhere")).toMatchObject({
      ok: false,
      code: "missing-parent",
    })
  })

  // Inserting a fragment whose ids are already present would silently replace
  // whatever was there.
  it("refuses ids the document already has", () => {
    const result = insert(sampleDocument(), fresh("heading"), "footer")

    expect(result).toMatchObject({ ok: false, code: "id-collision", nodeIds: ["heading"] })
  })

  it("does not touch the document it was given", () => {
    const document = sampleDocument()
    const before = JSON.stringify(document)

    insert(document, fresh(), "section", 1)

    expect(JSON.stringify(document)).toBe(before)
  })
})

describe("move", () => {
  it("moves to a new parent", () => {
    const document = ok(move(sampleDocument(), "heading", "footer"))

    expect(document.nodes["footer"]?.children).toEqual(["heading"])
    expect(document.nodes["section"]?.children).toEqual(["text"])
    expect(document.nodes["heading"]?.parentId).toBe("footer")
    expectValid(document)
  })

  it("reorders among siblings", () => {
    const document = ok(move(sampleDocument(), "text", "section", 0))

    expect(document.nodes["section"]?.children).toEqual(["text", "heading"])
    expectValid(document)
  })

  /*
   * Within one parent the index is read against the list as it looks now.
   * Lifting the node out first would shift everything after it by one, and a
   * move to the end would land one short.
   */
  it("moves to the end of its own parent", () => {
    const document = ok(move(sampleDocument(), "heading", "section", 1))

    expect(document.nodes["section"]?.children).toEqual(["text", "heading"])
  })

  it("is a no-op when nothing would change", () => {
    const before = sampleDocument()
    const document = ok(move(before, "heading", "section", 0))

    expect(document).toBe(before)
  })

  it("preserves the order of the siblings it leaves behind", () => {
    const start = ok(
      insert(sampleDocument(), { rootId: "x", nodes: { x: makeNode("x") } }, "section", 1),
    )
    const document = ok(move(start, "x", "footer"))

    expect(document.nodes["section"]?.children).toEqual(["heading", "text"])
  })

  // Moving a node inside itself detaches the whole branch from the root.
  it("refuses a move into its own descendant", () => {
    const result = move(sampleDocument(), "section", "heading")

    expect(result).toMatchObject({ ok: false, code: "cycle", nodeIds: ["section", "heading"] })
  })

  it("refuses a move into itself", () => {
    expect(move(sampleDocument(), "section", "section")).toMatchObject({ ok: false, code: "cycle" })
  })

  it("refuses to move the root", () => {
    expect(move(sampleDocument(), "root", "section")).toMatchObject({
      ok: false,
      code: "root-immovable",
    })
  })

  it("refuses a node that is not there", () => {
    expect(move(sampleDocument(), "nowhere", "section")).toMatchObject({
      ok: false,
      code: "missing-node",
    })
  })

  it("refuses a parent that is not there", () => {
    expect(move(sampleDocument(), "heading", "nowhere")).toMatchObject({
      ok: false,
      code: "missing-parent",
    })
  })

  it("refuses a parent that does not take children", () => {
    expect(
      move(sampleDocument(), "heading", "text", 0, { canHaveChildren: () => false }),
    ).toMatchObject({ ok: false, code: "rejects-children" })
  })

  /*
   * A node that is not the root and has no parent either. The document is
   * invalid, and move runs before anything has validated it — there is simply
   * nothing to detach it from.
   */
  it("moves a parentless node without trying to detach it", () => {
    const stray = { ...sampleDocument() }
    stray.nodes = { ...stray.nodes, stray: makeNode("stray", { type: "core.text" }) }

    const document = ok(move(stray, "stray", "footer"))

    expect(document.nodes["footer"]?.children).toEqual(["stray"])
    expect(document.nodes["stray"]?.parentId).toBe("footer")
  })

  it("does not touch the document it was given", () => {
    const document = sampleDocument()
    const before = JSON.stringify(document)

    move(document, "heading", "footer")

    expect(JSON.stringify(document)).toBe(before)
  })
})

describe("remove", () => {
  it("removes a leaf", () => {
    const document = ok(remove(sampleDocument(), "heading"))

    expect(document.nodes["heading"]).toBeUndefined()
    expect(document.nodes["section"]?.children).toEqual(["text"])
    expectValid(document)
  })

  // Removing only the node would leave its children reachable from nothing.
  it("removes a subtree whole, orphaning nothing", () => {
    const document = ok(remove(sampleDocument(), "section"))

    expect(Object.keys(document.nodes).sort()).toEqual(["footer", "root"])
    expectValid(document)
  })

  it("refuses the root", () => {
    expect(remove(sampleDocument(), "root")).toMatchObject({ ok: false, code: "root-immovable" })
  })

  it("refuses a node that is not there", () => {
    expect(remove(sampleDocument(), "nowhere")).toMatchObject({ ok: false, code: "missing-node" })
  })

  it("does not touch the document it was given", () => {
    const document = sampleDocument()
    const before = JSON.stringify(document)

    remove(document, "section")

    expect(JSON.stringify(document)).toBe(before)
  })
})

describe("duplicate", () => {
  it("copies a single node in beside the original", () => {
    const result = duplicate(sampleDocument(), "heading", { random: sequentialRandom() })
    const document = ok(result)

    expect(document.nodes["section"]?.children).toEqual(["heading", duplicatedId(result), "text"])
    expectValid(document)
  })

  it("copies a deep subtree", () => {
    const result = duplicate(sampleDocument(), "section", { random: sequentialRandom() })
    const document = ok(result)

    expect(subtreeIds(document, duplicatedId(result))).toHaveLength(3)
    expectValid(document)
  })

  it("regenerates every id", () => {
    const before = sampleDocument()
    const result = duplicate(before, "section", { random: sequentialRandom() })
    const document = ok(result)

    const copies = subtreeIds(document, duplicatedId(result))

    for (const id of copies) expect(before.nodes[id]).toBeUndefined()
  })

  // A copy whose children still point at the original is a copy that edits it.
  it("rewrites every reference inside the copy", () => {
    const result = duplicate(sampleDocument(), "section", { random: sequentialRandom() })
    const document = ok(result)
    const copies = new Set(subtreeIds(document, duplicatedId(result)))

    for (const id of copies) {
      const node = document.nodes[id] as Node

      for (const child of node.children) expect(copies.has(child)).toBe(true)
      if (id !== duplicatedId(result)) expect(copies.has(node.parentId as string)).toBe(true)
    }
  })

  it("refuses the root", () => {
    expect(duplicate(sampleDocument(), "root")).toMatchObject({ ok: false, code: "root-immovable" })
  })

  it("refuses a node that is not there", () => {
    expect(duplicate(sampleDocument(), "nowhere")).toMatchObject({
      ok: false,
      code: "missing-node",
    })
  })

  it("propagates a refusal from the insert it performs", () => {
    expect(duplicate(sampleDocument(), "heading", { canHaveChildren: () => false })).toMatchObject({
      ok: false,
      code: "rejects-children",
    })
  })

  /*
   * Each duplication happens into the result of the last, so the set of taken
   * ids grows and every run must avoid all of it.
   *
   * Three hundred here rather than the ten thousand the id generator is held to
   * on its own: duplicate copies the node record, so an accumulating loop is
   * quadratic in the document and would spend fourteen seconds proving
   * something `createId` already proves in milliseconds.
   */
  it("mints a fresh id on every run against a growing document", () => {
    let document = sampleDocument()
    const seen = new Set(Object.keys(document.nodes))

    for (let run = 0; run < 300; run += 1) {
      const result = duplicate(document, "heading")

      const created = duplicatedId(result)

      expect(seen.has(created)).toBe(false)

      seen.add(created)
      document = (result as { document: typeof document }).document
    }

    expect(seen.size).toBe(305)
  })

  it("does not touch the document it was given", () => {
    const document = sampleDocument()
    const before = JSON.stringify(document)

    duplicate(document, "section")

    expect(JSON.stringify(document)).toBe(before)
  })
})

describe("wrap", () => {
  const wrapper = () => makeNode("box", { type: "core.container" })

  it("wraps a single node", () => {
    const document = ok(wrap(sampleDocument(), ["heading"], wrapper()))

    expect(document.nodes["section"]?.children).toEqual(["box", "text"])
    expect(document.nodes["box"]?.children).toEqual(["heading"])
    expect(document.nodes["heading"]?.parentId).toBe("box")
    expectValid(document)
  })

  it("wraps several siblings, in sibling order", () => {
    const document = ok(wrap(sampleDocument(), ["text", "heading"], wrapper()))

    expect(document.nodes["box"]?.children).toEqual(["heading", "text"])
    expect(document.nodes["section"]?.children).toEqual(["box"])
    expectValid(document)
  })

  // A wrapper around the first and third of three would have to move the
  // second, and silently reordering a page is worse than declining.
  it("refuses a non-contiguous selection", () => {
    const document = ok(
      insert(sampleDocument(), { rootId: "mid", nodes: { mid: makeNode("mid") } }, "section", 1),
    )

    expect(wrap(document, ["heading", "text"], wrapper())).toMatchObject({
      ok: false,
      code: "not-siblings",
    })
  })

  it("refuses nodes with different parents", () => {
    expect(wrap(sampleDocument(), ["heading", "footer"], wrapper())).toMatchObject({
      ok: false,
      code: "not-siblings",
    })
  })

  it("refuses an empty selection", () => {
    expect(wrap(sampleDocument(), [], wrapper())).toMatchObject({
      ok: false,
      code: "empty-selection",
    })
  })

  it("refuses a node that is not there", () => {
    expect(wrap(sampleDocument(), ["nowhere"], wrapper())).toMatchObject({
      ok: false,
      code: "missing-node",
    })
  })

  it("refuses the root", () => {
    expect(wrap(sampleDocument(), ["root"], wrapper())).toMatchObject({
      ok: false,
      code: "root-immovable",
    })
  })

  // The wrapper is about to become a parent, and not everything can be one.
  it("refuses a wrapper that cannot hold children", () => {
    const result = wrap(sampleDocument(), ["heading"], makeNode("box", { type: "core.heading" }), {
      canHaveChildren: (node) => node.type !== "core.heading",
    })

    expect(result).toMatchObject({ ok: false, code: "rejects-children", nodeIds: ["box"] })
  })

  it("refuses a wrapper whose id is taken", () => {
    expect(wrap(sampleDocument(), ["heading"], makeNode("text"))).toMatchObject({
      ok: false,
      code: "id-collision",
    })
  })

  it("does not touch the document it was given", () => {
    const document = sampleDocument()
    const before = JSON.stringify(document)

    wrap(document, ["heading"], wrapper())

    expect(JSON.stringify(document)).toBe(before)
  })
})

describe("unwrap", () => {
  it("promotes children into the parent, in order", () => {
    const document = ok(unwrap(sampleDocument(), "section"))

    expect(document.nodes["root"]?.children).toEqual(["heading", "text", "footer"])
    expect(document.nodes["heading"]?.parentId).toBe("root")
    expect(document.nodes["section"]).toBeUndefined()
    expectValid(document)
  })

  it("removes a childless node", () => {
    const document = ok(unwrap(sampleDocument(), "footer"))

    expect(document.nodes["root"]?.children).toEqual(["section"])
    expectValid(document)
  })

  it("refuses the root", () => {
    expect(unwrap(sampleDocument(), "root")).toMatchObject({ ok: false, code: "root-immovable" })
  })

  it("refuses a node that is not there", () => {
    expect(unwrap(sampleDocument(), "nowhere")).toMatchObject({ ok: false, code: "missing-node" })
  })

  it("does not touch the document it was given", () => {
    const document = sampleDocument()
    const before = JSON.stringify(document)

    unwrap(document, "section")

    expect(JSON.stringify(document)).toBe(before)
  })
})

describe("update", () => {
  it("replaces a node's own fields", () => {
    const document = ok(
      update(sampleDocument(), "heading", (node) => ({ ...node, props: { text: "Hello" } })),
    )

    expect(document.nodes["heading"]?.props).toEqual({ text: "Hello" })
    expectValid(document)
  })

  // Structure is the tree's to decide. A props edit that rewrote `children`
  // would corrupt the document through a door meant for styling.
  it("ignores an updater that tries to restructure the tree", () => {
    const document = ok(
      update(sampleDocument(), "section", (node) => ({
        ...node,
        id: "hijacked",
        parentId: "footer",
        children: [],
      })),
    )

    expect(document.nodes["section"]?.children).toEqual(["heading", "text"])
    expect(document.nodes["section"]?.parentId).toBe("root")
    expectValid(document)
  })

  it("refuses a node that is not there", () => {
    expect(update(sampleDocument(), "nowhere", (node) => node)).toMatchObject({
      ok: false,
      code: "missing-node",
    })
  })

  it("does not touch the document it was given", () => {
    const document = sampleDocument()
    const before = JSON.stringify(document)

    update(document, "heading", (node) => ({ ...node, props: { text: "x" } }))

    expect(JSON.stringify(document)).toBe(before)
  })
})

describe("fragments", () => {
  it("extracts a subtree detached from its parent", () => {
    const fragment = extract(sampleDocument(), "section")

    expect(fragment?.rootId).toBe("section")
    expect(Object.keys(fragment?.nodes ?? {}).sort()).toEqual(["heading", "section", "text"])
    expect(fragment?.nodes["section"]?.parentId).toBeNull()
  })

  it("returns nothing for a node that is not there", () => {
    expect(extract(sampleDocument(), "nowhere")).toBeNull()
  })

  it("regenerates ids and every reference between them", () => {
    const fragment = extract(sampleDocument(), "section")
    const copy = regenerateIds(fragment as never, new Set(), sequentialRandom())
    const ids = new Set(Object.keys(copy.nodes))

    expect(ids.size).toBe(3)
    expect(ids.has("section")).toBe(false)
    expect(copy.nodes[copy.rootId]?.children.every((child) => ids.has(child))).toBe(true)
  })

  it("leaves a reference it cannot map alone rather than dropping it", () => {
    const orphaned = {
      rootId: "a",
      nodes: { a: makeNode("a", { children: ["gone"], parentId: "missing" }) },
    }
    const copy = regenerateIds(orphaned, new Set(), sequentialRandom())

    expect(copy.nodes[copy.rootId]?.children).toEqual(["gone"])
    expect(copy.nodes[copy.rootId]?.parentId).toBe("missing")
  })

  it("builds a node with the defaults every node has", () => {
    const node = createNode("core.text", new Set(), {}, sequentialRandom())

    expect(node).toMatchObject({
      type: "core.text",
      parentId: null,
      children: [],
      props: {},
      visibility: { hidden: false },
      metadata: { locked: false },
    })
  })
})

describe("collect", () => {
  it("returns the subtree in document order", () => {
    expect(collect(sampleDocument()).map((node) => node.id)).toEqual([
      "root",
      "section",
      "heading",
      "text",
      "footer",
    ])
  })
})
