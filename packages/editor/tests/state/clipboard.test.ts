import { describe, expect, it } from "vitest"
import { validateReferences } from "@checkout-studio/schema"

import { fromSchema } from "../../src/state/projection"
import { makeStore, sampleDocument } from "./support"

/**
 * The clipboard.
 *
 * A fragment is data from somewhere else, even when that somewhere else is this
 * page a moment ago. Everything that comes in through it is validated before it
 * is inserted, and everything that goes out gets new ids.
 */

describe("copy and paste", () => {
  it("copies the primary selection", () => {
    const { store, state } = makeStore()

    store.getState().select(["section"])

    expect(store.getState().copy()).toBe(true)
    expect(state().clipboard.fragment?.rootId).toBe("section")
    expect(Object.keys(state().clipboard.fragment?.nodes ?? {})).toHaveLength(3)
  })

  it("copies nothing when nothing is selected", () => {
    const { store, state } = makeStore()

    expect(store.getState().copy()).toBe(false)
    expect(state().clipboard.fragment).toBeNull()
  })

  it("remembers which project it came from", () => {
    const { store, state } = makeStore()

    store.getState().select(["heading"])
    store.getState().copy()

    expect(state().clipboard.sourceProjectId).toBe("prj_test")
  })

  // Otherwise a paste replaces the thing it was copied from.
  it("produces new ids on paste", () => {
    const { store, state } = makeStore()

    store.getState().select(["heading"])
    store.getState().copy()
    store.getState().paste("footer")

    const pasted = state().selection.ids[0] as string

    expect(pasted).not.toBe("heading")
    expect(state().document.nodes["heading"]).toBeDefined()
    expect(state().document.nodes["footer"]?.children).toEqual([pasted])
    expect(validateReferences(state().document)).toEqual([])
  })

  it("gives a copied subtree entirely new ids", () => {
    const { store, state } = makeStore()

    store.getState().select(["section"])
    store.getState().copy()
    store.getState().paste("footer")

    const pasted = state().selection.ids[0] as string
    const children = state().document.nodes[pasted]?.children ?? []

    expect(children).toHaveLength(2)
    expect(children).not.toContain("heading")
    expect(validateReferences(state().document)).toEqual([])
  })

  it("pastes into the selection when no parent is given", () => {
    const { store, state } = makeStore()

    store.getState().select(["heading"])
    store.getState().copy()
    store.getState().select(["footer"])
    store.getState().paste()

    expect(state().document.nodes["footer"]?.children).toHaveLength(1)
  })

  it("pastes into the root when nothing is selected", () => {
    const { store, state } = makeStore()

    store.getState().select(["heading"])
    store.getState().copy()
    store.getState().clearSelection()
    store.getState().paste()

    expect(state().document.nodes["root"]?.children).toHaveLength(3)
  })

  it("does nothing with an empty clipboard", () => {
    const { store } = makeStore()

    expect(store.getState().paste()).toBeNull()
    expect(store.getState().pasteInPlace()).toBeNull()
  })

  it("is one undo step", () => {
    const { store, state } = makeStore()
    const before = state().document

    store.getState().select(["section"])
    store.getState().copy()
    store.getState().paste("footer")
    store.getState().undo()

    expect(state().document).toBe(before)
  })
})

describe("paste in place", () => {
  /*
   * The clipboard remembers the parent and the index, which is what "in place"
   * means: the copy takes the slot the original had, and the original shifts
   * down one. Landing it after the original instead would read more like
   * duplicate — but then a cut and an immediate paste-in-place would not put
   * the node back where it came from, which is the case that has to be exact.
   */
  it("puts the copy in the slot the original had", () => {
    const { store, state } = makeStore()

    store.getState().select(["heading"])
    store.getState().copy()
    store.getState().pasteInPlace()

    const pasted = state().selection.ids[0] as string

    expect(state().document.nodes["section"]?.children).toEqual([pasted, "heading", "text"])
  })

  it("restores a cut node to exactly where it was", () => {
    const { store, state } = makeStore()

    store.getState().select(["heading"])
    store.getState().cut()

    expect(state().document.nodes["section"]?.children).toEqual(["text"])

    store.getState().pasteInPlace()

    const pasted = state().selection.ids[0] as string

    expect(state().document.nodes["section"]?.children).toEqual([pasted, "text"])
  })

  // Cut a section, delete its container, paste. Refusing would be correct and
  // useless.
  it("falls back to an ordinary paste when the original parent has gone", () => {
    const { store, state } = makeStore()

    store.getState().select(["heading"])
    store.getState().copy()
    store.getState().remove(["section"])
    store.getState().select(["footer"])
    store.getState().pasteInPlace()

    expect(state().document.nodes["footer"]?.children).toHaveLength(1)
  })

  it("falls back for a fragment that came from somewhere else", () => {
    const { store, state } = makeStore()

    store.getState().setClipboard(
      {
        rootId: "foreign",
        nodes: {
          foreign: {
            ...sampleDocument().nodes["heading"],
            id: "foreign",
            parentId: null,
          } as never,
        },
      },
      "prj_other",
    )
    store.getState().select(["footer"])
    store.getState().pasteInPlace()

    expect(state().document.nodes["footer"]?.children).toHaveLength(1)
  })
})

describe("cut", () => {
  it("removes the node from its source", () => {
    const { store, state } = makeStore()

    store.getState().select(["heading"])
    store.getState().cut()

    expect(state().document.nodes["heading"]).toBeUndefined()
    expect(state().clipboard.fragment?.rootId).toBe("heading")
    expect(state().clipboard.cut).toBe(true)
  })

  it("does nothing with an empty selection", () => {
    const { store, state } = makeStore()

    expect(store.getState().cut()).toBeNull()
    expect(state().document).toEqual(sampleDocument())
  })

  it("leaves the document alone when the removal is refused", () => {
    const { store, state } = makeStore()

    store.getState().select(["root"])

    const result = store.getState().cut()

    expect(result?.ok).toBe(false)
    expect(state().document).toEqual(sampleDocument())
  })
})

describe("paste styles", () => {
  it("applies styles and leaves content alone", () => {
    const { store, state } = makeStore()

    store.getState().setStyles(["heading"], { color: "red" })
    store.getState().setProps("heading", { text: "Source" })
    store.getState().select(["heading"])
    store.getState().copy()

    store.getState().setProps("text", { text: "Target" })
    store.getState().select(["text"])
    store.getState().pasteStyles()

    expect(state().document.nodes["text"]?.styles.desktop?.base).toEqual({ color: "red" })
    expect(state().document.nodes["text"]?.props["text"]).toBe("Target")
  })

  it("applies to every node it is given", () => {
    const { store, state } = makeStore()

    store.getState().setStyles(["heading"], { color: "red" })
    store.getState().select(["heading"])
    store.getState().copy()
    store.getState().pasteStyles(["text", "footer"])

    expect(state().document.nodes["text"]?.styles.desktop?.base).toEqual({ color: "red" })
    expect(state().document.nodes["footer"]?.styles.desktop?.base).toEqual({ color: "red" })
  })

  it("does nothing with an empty clipboard", () => {
    const { store } = makeStore()

    store.getState().select(["text"])

    expect(store.getState().pasteStyles()).toBeNull()
  })

  it("does nothing with no target", () => {
    const { store } = makeStore()

    store.getState().select(["heading"])
    store.getState().copy()
    store.getState().clearSelection()

    expect(store.getState().pasteStyles()).toBeNull()
  })
})

describe("foreign clipboard content", () => {
  /*
   * Pasted JSON is data from outside this process, and the only thing standing
   * between it and the document is validation. The full import pipeline — with
   * redaction and asset rehydration — joins paste in Phase 15.
   */
  it("rejects a document that does not pass validation", () => {
    const broken = { ...sampleDocument(), nodes: {} }

    expect(fromSchema(broken).ok).toBe(false)
  })

  it("rejects something that is not a document at all", () => {
    expect(fromSchema({ hello: "world" }).ok).toBe(false)
    expect(fromSchema("not json").ok).toBe(false)
  })

  it("accepts a document that does pass", () => {
    expect(fromSchema(sampleDocument()).ok).toBe(true)
  })

  // The ids are regenerated on insert, so a fragment from another project
  // cannot collide with anything here.
  it("accepts a fragment from another project, with new ids", () => {
    const { store, state } = makeStore()

    store.getState().setClipboard(
      {
        rootId: "heading",
        nodes: {
          heading: { ...sampleDocument().nodes["heading"], parentId: null } as never,
        },
      },
      "prj_elsewhere",
    )
    store.getState().paste("footer")

    const pasted = state().selection.ids[0] as string

    expect(pasted).not.toBe("heading")
    expect(state().document.nodes["heading"]).toBeDefined()
    expect(validateReferences(state().document)).toEqual([])
  })
})
