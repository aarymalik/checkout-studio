import { describe, expect, it } from "vitest"

import { diff, summarize, unchanged } from "../src/document/diff"
import { insert, remove, update } from "../src/tree/operations"
import { makeNode, sampleDocument, withNodeAt } from "./support"

/**
 * What changed between two documents.
 *
 * Written for the conflict prompt, which has to tell somebody what they are
 * choosing between. A prompt that says only "this page was changed elsewhere"
 * asks a person to gamble.
 */

function applied(result: ReturnType<typeof remove>) {
  expect(result.ok).toBe(true)

  return (result as { ok: true; document: ReturnType<typeof sampleDocument> }).document
}

describe("diff", () => {
  it("finds nothing between a document and itself", () => {
    const document = sampleDocument()

    expect(unchanged(diff(document, document))).toBe(true)
  })

  it("finds nothing between two equal documents written differently", () => {
    const one = sampleDocument()
    const other = { ...sampleDocument(), theme: { themeId: "theme_test" } }

    expect(unchanged(diff(one, other))).toBe(true)
  })

  it("finds an added node", () => {
    const before = sampleDocument()
    const after = applied(
      insert(before, { rootId: "new", nodes: { new: makeNode("new") } }, "footer"),
    )

    expect(diff(before, after).added).toEqual(["new"])
    // The parent gained a child, which is a change to the parent.
    expect(diff(before, after).changed).toEqual(["footer"])
  })

  it("finds a removed node and everything under it", () => {
    const before = sampleDocument()
    const after = applied(remove(before, "section"))

    expect([...diff(before, after).removed].sort()).toEqual(["heading", "section", "text"])
  })

  it("finds an edited node", () => {
    const before = sampleDocument()
    const after = applied(update(before, "heading", (node) => ({ ...node, props: { text: "Hi" } })))

    expect(diff(before, after).changed).toEqual(["heading"])
  })

  it("finds a moved node, as a change to it and to both parents", () => {
    const before = sampleDocument()
    const after = withNodeAt(
      withNodeAt(withNodeAt(before, "heading", { parentId: "footer" }), "section", {
        children: ["text"],
      }),
      "footer",
      { children: ["heading"] },
    )

    expect([...diff(before, after).changed].sort()).toEqual(["footer", "heading", "section"])
  })

  it("finds a reorder", () => {
    const before = sampleDocument()
    const after = withNodeAt(before, "section", { children: ["text", "heading"] })

    expect(diff(before, after).changed).toEqual(["section"])
  })

  it("finds a change to the page's own settings", () => {
    const before = sampleDocument()
    const after = { ...before, settings: { currency: "GBP" } }

    expect(diff(before, after).settingsChanged).toBe(true)
    expect(diff(before, after).changed).toEqual([])
  })

  it("finds a change of theme", () => {
    const before = sampleDocument()
    const after = { ...before, theme: { themeId: "theme_other" } }

    expect(diff(before, after).settingsChanged).toBe(true)
  })

  it("does not call a node changed when only its neighbours were", () => {
    const before = sampleDocument()
    const after = applied(update(before, "heading", (node) => ({ ...node, props: { text: "Hi" } })))

    expect(diff(before, after).changed).not.toContain("text")
    expect(diff(before, after).changed).not.toContain("footer")
  })
})

describe("summarize", () => {
  // What helps somebody choose is counts, not a list of ids.
  it("reads as the conflict prompt shows it", () => {
    expect(
      summarize({
        added: ["a"],
        removed: [],
        changed: ["b", "c", "d", "e"],
        settingsChanged: false,
      }),
    ).toBe("1 node added, 4 nodes edited")
  })

  it("counts deletions", () => {
    expect(summarize({ added: [], removed: ["a", "b"], changed: [], settingsChanged: false })).toBe(
      "2 nodes deleted",
    )
  })

  it("mentions the page's own settings", () => {
    expect(summarize({ added: [], removed: [], changed: [], settingsChanged: true })).toBe(
      "page settings changed",
    )
  })

  it("lists everything that changed, in a fixed order", () => {
    expect(summarize({ added: ["a"], removed: ["b"], changed: ["c"], settingsChanged: true })).toBe(
      "1 node added, 1 node deleted, 1 node edited, page settings changed",
    )
  })

  it("says so when nothing changed", () => {
    expect(summarize({ added: [], removed: [], changed: [], settingsChanged: false })).toBe(
      "no changes",
    )
  })
})
