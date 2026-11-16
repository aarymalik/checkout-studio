import { describe, expect, it } from "vitest"

import { SYMBOL_INSTANCE_TYPE, detachSymbol, symbolReferences, validateReferences } from "../src"
import type { Fragment } from "../src"
import { makeDocument, makeNode, nodeAt, sequentialRandom } from "./support"
import type { CheckoutSchema } from "../src/document/schema"

/**
 * Symbols, from the page's side.
 *
 * A definition is a project-level record and never part of a page, so
 * nothing here is about what a symbol *is*. These are about the two things
 * a page does with one: say which it uses, and stop using one.
 */

function instance(id: string, symbolId: string | undefined, parentId = "root") {
  return makeNode(id, {
    type: SYMBOL_INSTANCE_TYPE,
    parentId,
    props: symbolId === undefined ? {} : { symbolId, overrides: {} },
  })
}

function pageWith(...children: string[]): CheckoutSchema["nodes"][string] {
  return makeNode("root", { type: "core.page", children })
}

/** A footer, as a definition would hold it. */
function footer(): Fragment {
  return {
    rootId: "sym_root",
    nodes: {
      sym_root: makeNode("sym_root", { type: "core.section", children: ["sym_text"] }),
      sym_text: makeNode("sym_text", { type: "core.text", parentId: "sym_root" }),
    },
  }
}

describe("which symbols a page places", () => {
  it("is none for a page with no instances", () => {
    const page = makeDocument([pageWith("copy"), makeNode("copy", { parentId: "root" })])

    expect([...symbolReferences(page)]).toEqual([])
  })

  it("is the symbol an instance names", () => {
    const page = makeDocument([pageWith("one"), instance("one", "sym_footer")])

    expect([...symbolReferences(page)]).toEqual(["sym_footer"])
  })

  it("names each once, however many instances place it", () => {
    // Two footers on a page are one definition to carry.
    const page = makeDocument([
      pageWith("one", "two"),
      instance("one", "sym_footer"),
      instance("two", "sym_footer"),
    ])

    expect([...symbolReferences(page)]).toEqual(["sym_footer"])
  })

  it("ignores an instance that names no symbol", () => {
    /*
     * A node is not required to be sensible for a document to be readable —
     * that is a validation question. A walk that threw would make an export
     * impossible rather than incomplete.
     */
    const page = makeDocument([pageWith("one"), instance("one", undefined)])

    expect([...symbolReferences(page)]).toEqual([])
  })

  it("ignores a symbolId that is not a string", () => {
    const page = makeDocument([
      pageWith("one"),
      makeNode("one", { type: SYMBOL_INSTANCE_TYPE, parentId: "root", props: { symbolId: 7 } }),
    ])

    expect([...symbolReferences(page)]).toEqual([])
  })

  it("does not mistake an ordinary node carrying a symbolId prop", () => {
    // The type is what makes a node an instance, not a prop somebody named
    // the same thing.
    const page = makeDocument([
      pageWith("one"),
      makeNode("one", { type: "core.text", parentId: "root", props: { symbolId: "sym_x" } }),
    ])

    expect([...symbolReferences(page)]).toEqual([])
  })
})

/** A page with an instance between two ordinary nodes. */
const page = (): CheckoutSchema =>
  makeDocument([
    pageWith("before", "one", "after"),
    makeNode("before", { parentId: "root" }),
    instance("one", "sym_footer"),
    makeNode("after", { parentId: "root" }),
  ])

describe("detaching one", () => {
  it("puts the symbol's nodes in and takes the instance out", () => {
    const result = detachSymbol(page(), "one", footer(), { random: sequentialRandom() })

    expect(result.ok).toBe(true)

    if (!result.ok) return

    expect(result.document.nodes["one"]).toBeUndefined()
    expect(Object.keys(result.document.nodes)).toHaveLength(5)
  })

  it("puts them where the instance was", () => {
    // A detached footer appears where the footer was.
    const result = detachSymbol(page(), "one", footer(), { random: sequentialRandom() })

    if (!result.ok) throw new Error("Expected it to detach.")

    const children = nodeAt(result.document, "root").children

    expect(children).toHaveLength(3)
    expect(children[0]).toBe("before")
    expect(children[2]).toBe("after")
  })

  it("gives the copy ids of its own", () => {
    /*
     * The same symbol may already be detached elsewhere on the page, and two
     * copies cannot share ids. `insert` refuses a collision rather than
     * overwriting, so this would be a refusal either way — and a refusal is
     * not what somebody clicking detach wants.
     */
    const result = detachSymbol(page(), "one", footer(), { random: sequentialRandom() })

    if (!result.ok) throw new Error("Expected it to detach.")

    expect(Object.keys(result.document.nodes)).not.toContain("sym_root")
    expect(Object.keys(result.document.nodes)).not.toContain("sym_text")
  })

  it("leaves a document that still holds together", () => {
    const result = detachSymbol(page(), "one", footer(), { random: sequentialRandom() })

    if (!result.ok) throw new Error("Expected it to detach.")

    expect(validateReferences(result.document)).toEqual([])
  })

  it("works twice on one page, which is the collision it avoids", () => {
    const twice = makeDocument([
      pageWith("one", "two"),
      instance("one", "sym_footer"),
      instance("two", "sym_footer"),
    ])
    const random = sequentialRandom()
    const first = detachSymbol(twice, "one", footer(), { random })

    if (!first.ok) throw new Error("Expected the first to detach.")

    const second = detachSymbol(first.document, "two", footer(), { random })

    expect(second.ok).toBe(true)
    expect(second.ok ? validateReferences(second.document) : [{}]).toEqual([])
  })

  it("stops being a symbol, which is the point of it", () => {
    const result = detachSymbol(page(), "one", footer(), { random: sequentialRandom() })

    if (!result.ok) throw new Error("Expected it to detach.")

    expect([...symbolReferences(result.document)]).toEqual([])
  })
})

describe("detaching what cannot be detached", () => {
  it("refuses a node that is not there", () => {
    const page = makeDocument([pageWith()])

    expect(detachSymbol(page, "nobody", footer())).toMatchObject({ code: "missing-node" })
  })

  it("refuses an instance at the root", () => {
    /*
     * A page's root is a page. One here would be a document that should not
     * have validated, and replacing it would mean deciding what the new root
     * is — a question with no answer rather than a case to handle.
     */
    const odd = makeDocument([makeNode("root", { type: SYMBOL_INSTANCE_TYPE })])

    expect(detachSymbol(odd, "root", footer())).toMatchObject({ code: "root-immovable" })
  })

  it("refuses when the parent it names is not in the document", () => {
    const orphaned = makeDocument([pageWith(), instance("one", "sym_footer", "nowhere")])

    expect(detachSymbol(orphaned, "one", footer())).toMatchObject({ code: "missing-parent" })
  })

  it("passes on a refusal from the insert rather than inventing one", () => {
    // A parent that takes no children is the component library's rule, and
    // the answer should be the one it already gives.
    const result = detachSymbol(page(), "one", footer(), {
      random: sequentialRandom(),
      canHaveChildren: () => false,
    })

    expect(result).toMatchObject({ code: "rejects-children" })
  })
})
