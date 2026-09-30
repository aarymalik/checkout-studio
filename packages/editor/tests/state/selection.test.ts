import { describe, expect, it } from "vitest"

import {
  breadcrumbs,
  isHidden,
  isLocked,
  primarySelection,
  resolvedStyles,
  selectedNodes,
  usedAssets,
} from "../../src/state/selectors"
import { makeStore } from "./support"

describe("selection", () => {
  it("selects one", () => {
    const { store, state } = makeStore()

    store.getState().select(["heading"])

    expect(state().selection.ids).toEqual(["heading"])
  })

  it("selects several", () => {
    const { store, state } = makeStore()

    store.getState().select(["heading", "text"])

    expect(state().selection.ids).toEqual(["heading", "text"])
  })

  it("adds to a selection", () => {
    const { store, state } = makeStore()

    store.getState().select(["heading"])
    store.getState().addToSelection("text")

    expect(state().selection.ids).toEqual(["heading", "text"])
  })

  it("does not add the same node twice", () => {
    const { store, state } = makeStore()

    store.getState().select(["heading"])
    store.getState().addToSelection("heading")

    expect(state().selection.ids).toEqual(["heading"])
  })

  it("toggles", () => {
    const { store, state } = makeStore()

    store.getState().toggleSelection("heading")
    expect(state().selection.ids).toEqual(["heading"])

    store.getState().toggleSelection("heading")
    expect(state().selection.ids).toEqual([])
  })

  it("clears", () => {
    const { store, state } = makeStore()

    store.getState().select(["heading", "text"])
    store.getState().clearSelection()

    expect(state().selection.ids).toEqual([])
  })

  // Selecting something that is not there would put the inspector into a state
  // nothing can get it out of.
  it("ignores ids that are not in the document", () => {
    const { store, state } = makeStore()

    store.getState().select(["heading", "nowhere"])
    store.getState().addToSelection("also-nowhere")
    store.getState().toggleSelection("still-nowhere")

    expect(state().selection.ids).toEqual(["heading"])
  })

  describe("moving around the tree", () => {
    it("selects the parent", () => {
      const { store, state } = makeStore()

      store.getState().select(["heading"])
      store.getState().selectParent()

      expect(state().selection.ids).toEqual(["section"])
    })

    it("stays put at the root, which has no parent", () => {
      const { store, state } = makeStore()

      store.getState().select(["root"])
      store.getState().selectParent()

      expect(state().selection.ids).toEqual(["root"])
    })

    it("selects the first child", () => {
      const { store, state } = makeStore()

      store.getState().select(["section"])
      store.getState().selectFirstChild()

      expect(state().selection.ids).toEqual(["heading"])
    })

    it("stays put on a node with no children", () => {
      const { store, state } = makeStore()

      store.getState().select(["heading"])
      store.getState().selectFirstChild()

      expect(state().selection.ids).toEqual(["heading"])
    })

    it("selects the next sibling", () => {
      const { store, state } = makeStore()

      store.getState().select(["heading"])
      store.getState().selectSibling(1)

      expect(state().selection.ids).toEqual(["text"])
    })

    it("selects the previous sibling", () => {
      const { store, state } = makeStore()

      store.getState().select(["text"])
      store.getState().selectSibling(-1)

      expect(state().selection.ids).toEqual(["heading"])
    })

    it("stays put at either end of the siblings", () => {
      const { store, state } = makeStore()

      store.getState().select(["text"])
      store.getState().selectSibling(1)

      expect(state().selection.ids).toEqual(["text"])
    })

    it("does nothing with an empty selection", () => {
      const { store, state } = makeStore()

      store.getState().selectParent()
      store.getState().selectFirstChild()
      store.getState().selectSibling(1)

      expect(state().selection.ids).toEqual([])
    })
  })

  // A selection pointing at a deleted node is a selection the inspector cannot
  // render and nothing can clear.
  it("drops a node that was deleted", () => {
    const { store, state } = makeStore()

    store.getState().select(["heading", "text"])
    store.getState().remove(["heading"])

    expect(state().selection.ids).toEqual(["text"])
  })

  it("drops a node that was removed by ungrouping", () => {
    const { store, state } = makeStore()

    store.getState().select(["section"])
    store.getState().unwrap("section")

    expect(state().selection.ids).toEqual([])
  })

  describe("multi-selection operations", () => {
    it("deletes several", () => {
      const { store, state } = makeStore()

      store.getState().remove(["heading", "text"])

      expect(state().document.nodes["section"]?.children).toEqual([])
    })

    it("duplicates several, selecting the copies", () => {
      const { store, state } = makeStore()

      store.getState().duplicate(["heading", "text"])

      expect(state().document.nodes["section"]?.children).toHaveLength(4)
      expect(state().selection.ids).toHaveLength(2)
    })

    it("groups several", () => {
      const { store, state } = makeStore()

      store.getState().wrap(["heading", "text"], "core.container")

      const wrapper = state().selection.ids[0] as string

      expect(state().document.nodes[wrapper]?.children).toEqual(["heading", "text"])
    })

    it("locks and unlocks several", () => {
      const { store, state } = makeStore()

      store.getState().setLocked(["heading", "text"], true)

      expect(state().document.nodes["heading"]?.metadata.locked).toBe(true)
      expect(state().document.nodes["text"]?.metadata.locked).toBe(true)

      store.getState().setLocked(["heading"], false)

      expect(state().document.nodes["heading"]?.metadata.locked).toBe(false)
    })

    it("hides and shows several", () => {
      const { store, state } = makeStore()

      store.getState().setHidden(["heading", "text"], true)

      expect(state().document.nodes["heading"]?.visibility.hidden).toBe(true)
      expect(state().document.nodes["text"]?.visibility.hidden).toBe(true)

      store.getState().setHidden(["heading", "text"], false)

      expect(state().document.nodes["heading"]?.visibility.hidden).toBe(false)
      expect(state().history.past.at(-1)?.label).toBe("Show")
    })

    it("styles several at once", () => {
      const { store, state } = makeStore()

      store.getState().setStyles(["heading", "text"], { color: "red" })

      expect(state().document.nodes["heading"]?.styles.desktop?.base).toEqual({ color: "red" })
      expect(state().document.nodes["text"]?.styles.desktop?.base).toEqual({ color: "red" })
    })

    // One refusal stops the whole thing rather than leaving half of it applied.
    it("applies nothing when one of the group fails", () => {
      const { store, state } = makeStore()
      const before = state().document

      const result = store.getState().remove(["heading", "nowhere"])

      expect(result.ok).toBe(false)
      expect(state().document).toBe(before)
    })
  })
})

describe("selectors", () => {
  it("reports the primary selection", () => {
    const { store, state } = makeStore()

    store.getState().select(["text", "heading"])

    expect(primarySelection(state())?.id).toBe("text")
  })

  it("reports nothing with an empty selection", () => {
    const { state } = makeStore()

    expect(primarySelection(state())).toBeNull()
    expect(breadcrumbs(state())).toEqual([])
    expect(selectedNodes(state())).toEqual([])
  })

  it("lists the selected nodes", () => {
    const { store, state } = makeStore()

    store.getState().select(["heading", "text"])

    expect(selectedNodes(state()).map((node) => node.id)).toEqual(["heading", "text"])
  })

  it("builds breadcrumbs from the root down", () => {
    const { store, state } = makeStore()

    store.getState().select(["heading"])

    expect(breadcrumbs(state()).map((node) => node.id)).toEqual(["root", "section", "heading"])
  })

  describe("resolvedStyles", () => {
    const node = {
      styles: {
        desktop: { base: { fontSize: 48, color: "black" }, hover: { color: "blue" } },
        tablet: { base: { fontSize: 32 } },
        mobile: { base: { fontSize: 24 } },
      },
    } as never as Parameters<typeof resolvedStyles>[0]

    // Only overrides are stored, so this is where a desktop value becomes the
    // value mobile uses.
    it("cascades desktop down to mobile", () => {
      expect(resolvedStyles(node, "mobile")).toEqual({ fontSize: 24, color: "black" })
    })

    it("cascades desktop down to tablet", () => {
      expect(resolvedStyles(node, "tablet")).toEqual({ fontSize: 32, color: "black" })
    })

    it("returns desktop as written", () => {
      expect(resolvedStyles(node, "desktop")).toEqual({ fontSize: 48, color: "black" })
    })

    it("layers a state on top of base", () => {
      expect(resolvedStyles(node, "desktop", "hover")).toEqual({ fontSize: 48, color: "blue" })
    })

    it("inherits a state from a wider breakpoint", () => {
      expect(resolvedStyles(node, "mobile", "hover")).toEqual({ fontSize: 24, color: "blue" })
    })

    it("returns nothing for a node with no styles", () => {
      expect(resolvedStyles({ styles: {} } as never, "desktop")).toEqual({})
    })
  })

  describe("inherited flags", () => {
    it("reports a node hidden by its ancestor", () => {
      const { store, state } = makeStore()

      store.getState().setHidden(["section"], true)

      expect(isHidden(state().document, "heading")).toBe(true)
      expect(isHidden(state().document, "footer")).toBe(false)
    })

    it("reports a node locked by its ancestor", () => {
      const { store, state } = makeStore()

      store.getState().setLocked(["section"], true)

      expect(isLocked(state().document, "heading")).toBe(true)
      expect(isLocked(state().document, "footer")).toBe(false)
    })
  })

  describe("usedAssets", () => {
    // Derived by walking the page. Never stored, so it cannot go stale.
    it("finds references wherever they are nested", () => {
      const { store, state } = makeStore()

      store.getState().setProps("heading", {
        image: { $asset: "ast_one" },
        gallery: [{ src: { $asset: "ast_two" } }],
      })

      expect([...usedAssets(state().document)].sort()).toEqual(["ast_one", "ast_two"])
    })

    it("finds the ones in page settings", () => {
      const { state } = makeStore()
      const document = {
        ...state().document,
        settings: {
          favicon: { $asset: "ast_icon" },
          seo: { image: { $asset: "ast_social" } },
        },
      }

      expect([...usedAssets(document)].sort()).toEqual(["ast_icon", "ast_social"])
    })

    it("finds none in a page that uses none", () => {
      const { state } = makeStore()

      expect(usedAssets(state().document)).toEqual([])
    })

    it("does not mistake a plain string for a reference", () => {
      const { store, state } = makeStore()

      store.getState().setProps("heading", { text: "ast_not_an_asset" })

      expect(usedAssets(state().document)).toEqual([])
    })
  })
})
