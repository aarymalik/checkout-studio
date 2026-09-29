import { describe, expect, it } from "vitest"

import {
  canRedo,
  canUndo,
  childrenOf,
  isDirty,
  nodeById,
  primarySelection,
  selectedIds,
} from "../../src/state/selectors"
import { emptyHistory } from "../../src/state/history"
import { createEditorStore } from "../../src/state/store"
import { makeStore, sampleDocument } from "./support"

/**
 * The parts of the store that are not the document: viewport, drag and the
 * save status. None of them are ever persisted, and none of them belong in
 * history — moving the canvas is not something anybody undoes.
 */

describe("viewport", () => {
  it("switches breakpoint", () => {
    const { store, state } = makeStore()

    store.getState().setBreakpoint("mobile")

    expect(state().viewport.breakpoint).toBe("mobile")
  })

  it("clamps zoom to the range from docs/editor-behavior.md", () => {
    const { store, state } = makeStore()

    store.getState().setZoom(99)
    expect(state().viewport.zoom).toBe(4)

    store.getState().setZoom(0)
    expect(state().viewport.zoom).toBe(0.1)

    store.getState().setZoom(1.5)
    expect(state().viewport.zoom).toBe(1.5)
  })

  it("pans", () => {
    const { store, state } = makeStore()

    store.getState().setPan({ x: 10, y: -20 })

    expect(state().viewport.pan).toEqual({ x: 10, y: -20 })
  })

  it("toggles the editing chrome", () => {
    const { store, state } = makeStore()

    store.getState().toggleViewportFlag("showRulers")
    store.getState().toggleViewportFlag("snapping")

    expect(state().viewport.showRulers).toBe(true)
    expect(state().viewport.snapping).toBe(false)
  })

  // Moving the canvas is not something anybody undoes.
  it("writes nothing to history and leaves the page clean", () => {
    const { store, state } = makeStore()

    store.getState().setZoom(2)
    store.getState().setBreakpoint("tablet")
    store.getState().setPan({ x: 1, y: 1 })
    store.getState().toggleViewportFlag("showGrid")

    expect(state().history.past).toEqual([])
    expect(state().persistence.status).toBe("saved")
  })

  it("sets which state the inspector edits", () => {
    const { store, state } = makeStore()

    store.getState().setEditingState("hover")

    expect(state().selection.editingState).toBe("hover")
  })

  it("uses the editing state when styling without being told one", () => {
    const { store, state } = makeStore()

    store.getState().setEditingState("hover")
    store.getState().setStyles(["heading"], { color: "blue" })

    expect(state().document.nodes["heading"]?.styles.desktop?.hover).toEqual({ color: "blue" })
  })

  it("uses the current breakpoint when styling without being told one", () => {
    const { store, state } = makeStore()

    store.getState().setBreakpoint("mobile")
    store.getState().setStyles(["heading"], { fontSize: 24 })

    expect(state().document.nodes["heading"]?.styles.mobile?.base).toEqual({ fontSize: 24 })
  })
})

describe("drag", () => {
  it("tracks what is being dragged and where it is over", () => {
    const { store, state } = makeStore()

    store.getState().beginDrag(["heading", "text"])
    store.getState().setDropTarget("footer", "inside")

    expect(state().drag).toEqual({ ids: ["heading", "text"], overId: "footer", position: "inside" })
  })

  it("clears on end", () => {
    const { store, state } = makeStore()

    store.getState().beginDrag(["heading"])
    store.getState().setDropTarget("footer", "before")
    store.getState().endDrag()

    expect(state().drag).toEqual({ ids: [], overId: null, position: null })
  })

  // Drag state is separate from the document: nothing has happened yet.
  it("writes nothing to history", () => {
    const { store, state } = makeStore()

    store.getState().beginDrag(["heading"])
    store.getState().setDropTarget("footer", "inside")
    store.getState().endDrag()

    expect(state().history.past).toEqual([])
    expect(state().persistence.status).toBe("saved")
  })
})

describe("save status", () => {
  it("starts clean and goes modified on the first edit", () => {
    const { store, state } = makeStore()

    expect(state().persistence.status).toBe("saved")

    store.getState().setProps("heading", { text: "Hello" })

    expect(state().persistence.status).toBe("modified")
    expect(isDirty(state())).toBe(true)
  })

  it("moves through saving to saved, keeping the new version", () => {
    const { store, state } = makeStore()

    store.getState().setProps("heading", { text: "Hello" })
    store.getState().markSaving()

    expect(state().persistence.status).toBe("saving")

    store.getState().markSaved(3, 1234)

    expect(state().persistence).toMatchObject({
      status: "saved",
      baseVersion: 3,
      lastSavedAt: 1234,
      error: null,
    })
    expect(isDirty(state())).toBe(false)
  })

  it("stamps the save time from the store's clock when not given one", () => {
    const { store, state } = makeStore()

    store.getState().markSaved(1)

    expect(state().persistence.lastSavedAt).toBe(1_000)
  })

  it("records why a save failed", () => {
    const { store, state } = makeStore()

    store.getState().markSaveFailed("The network went away.")

    expect(state().persistence).toMatchObject({
      status: "error",
      error: "The network went away.",
    })
  })

  it("clears an earlier error once a save succeeds", () => {
    const { store, state } = makeStore()

    store.getState().markSaveFailed("nope")
    store.getState().markSaved(2)

    expect(state().persistence.error).toBeNull()
  })

  // Another session holds the lock: the page opens read-only.
  it("records that editing is not allowed", () => {
    const { store, state } = makeStore()

    store.getState().setCanEdit(false)

    expect(state().persistence.canEdit).toBe(false)
  })
})

describe("small selectors", () => {
  it("reports the selection", () => {
    const { store, state } = makeStore()

    store.getState().select(["heading", "text"])

    expect(selectedIds(state())).toEqual(["heading", "text"])
  })

  it("finds a node, or reports that there is none", () => {
    const { state } = makeStore()

    expect(nodeById(state(), "heading")?.type).toBe("core.heading")
    expect(nodeById(state(), "nowhere")).toBeNull()
  })

  it("lists a node's children as nodes", () => {
    const { state } = makeStore()

    expect(childrenOf(state(), "section").map((node) => node.id)).toEqual(["heading", "text"])
    expect(childrenOf(state(), "heading")).toEqual([])
    expect(childrenOf(state(), "nowhere")).toEqual([])
  })

  it("skips a child that is listed but missing", () => {
    const { state } = makeStore()
    const broken = {
      ...state(),
      document: {
        ...state().document,
        nodes: {
          ...state().document.nodes,
          section: { ...state().document.nodes["section"], children: ["heading", "ghost"] },
        },
      },
    }

    expect(childrenOf(broken as never, "section").map((node) => node.id)).toEqual(["heading"])
  })

  it("reports whether there is anything to undo or redo", () => {
    const { store, state } = makeStore()

    expect(canUndo(state())).toBe(false)
    expect(canRedo(state())).toBe(false)

    store.getState().setProps("heading", { text: "Hello" })

    expect(canUndo(state())).toBe(true)

    store.getState().undo()

    expect(canUndo(state())).toBe(false)
    expect(canRedo(state())).toBe(true)
  })
})

describe("defaults", () => {
  /*
   * Everything else here injects a clock and a random source so the tests are
   * reproducible. Production supplies neither, so the defaults need exercising
   * somewhere or nothing has ever run them.
   */
  it("uses the real clock and a real random source when given neither", () => {
    const store = createEditorStore({ document: sampleDocument() })

    store.getState().setProps("heading", { text: "Hello" })

    expect(store.getState().history.past).toHaveLength(1)
    expect(store.getState().history.past[0]?.at).toBeGreaterThan(0)

    store.getState().duplicate(["heading"])

    expect(store.getState().selection.ids[0]).toMatch(/^heading_/)
  })

  it("takes an injected random source", () => {
    let calls = 0
    const store = createEditorStore({
      document: sampleDocument(),
      random: () => {
        calls += 1

        return 0.5
      },
    })

    store.getState().insertNew("core.text", "footer")

    expect(calls).toBeGreaterThan(0)
  })
})

describe("emptyHistory", () => {
  it("is what a store starts and reloads with", () => {
    expect(emptyHistory()).toEqual({ past: [], future: [], transactionDepth: 0, pending: null })
  })
})

describe("insert", () => {
  it("selects what it inserted", () => {
    const { store, state } = makeStore()

    store.getState().insertNew("core.text", "footer")

    const inserted = state().document.nodes["footer"]?.children[0] as string

    expect(state().selection.ids).toEqual([inserted])
  })

  it("reports a refusal without changing anything", () => {
    const { store, state } = makeStore()
    const before = state().document

    const result = store.getState().insertNew("core.text", "nowhere")

    expect(result.ok).toBe(false)
    expect(state().document).toBe(before)
    expect(state().history.past).toEqual([])
  })

  it("honours a catalogue that says a node takes no children", () => {
    const { store, state } = makeStore(undefined, {
      canHaveChildren: (node) => node.type !== "core.heading",
    })

    const result = store.getState().insertNew("core.text", "heading")

    expect(result).toMatchObject({ ok: false, code: "rejects-children" })
    expect(state().history.past).toEqual([])
  })
})

describe("edges the invariants are meant to prevent", () => {
  /*
   * Selection is pruned whenever a node goes, so these cannot happen through
   * the store's own API. They are reached here by writing state directly,
   * because a guard that has never run is a guard nobody knows works.
   */
  it("copies nothing when the selection names a node that is gone", () => {
    const { store, state } = makeStore()

    store.setState({ selection: { ...state().selection, ids: ["vanished"] } })

    expect(store.getState().copy()).toBe(false)
  })

  it("reports no primary selection when the selection names a node that is gone", () => {
    const { store, state } = makeStore()

    store.setState({ selection: { ...state().selection, ids: ["vanished"] } })

    expect(primarySelection(state())).toBeNull()
  })

  it("duplicates nothing when one of the group cannot be duplicated", () => {
    const { store, state } = makeStore()
    const before = state().document

    const result = store.getState().duplicate(["heading", "root"])

    expect(result).toMatchObject({ ok: false, code: "root-immovable" })
    expect(state().document).toBe(before)
    expect(state().history.past).toEqual([])
  })

  it("duplicates nothing when given nothing", () => {
    const { store, state } = makeStore()
    const before = state().document

    store.getState().select(["heading"])
    const result = store.getState().duplicate([])

    expect(result.ok).toBe(true)
    expect(state().document).toBe(before)
    // The selection is left alone: nothing was created to select.
    expect(state().selection.ids).toEqual(["heading"])
  })
})

describe("rename", () => {
  it("sets the display name without touching anything else", () => {
    const { store, state } = makeStore()

    store.getState().rename("heading", "Page title")

    expect(state().document.nodes["heading"]?.metadata.name).toBe("Page title")
    expect(state().document.nodes["heading"]?.props).toEqual({})
  })
})

describe("theme", () => {
  it("points the page at another theme", () => {
    const { store, state } = makeStore()

    store.getState().setTheme("theme_other")

    expect(state().document.theme.themeId).toBe("theme_other")
  })

  it("groups into an open transaction like any other change", () => {
    const { store, state } = makeStore()

    store.getState().transact("Restyle", () => {
      store.getState().setTheme("theme_other")
      store.getState().setStyles(["heading"], { color: "red" })
    })

    expect(state().history.past).toHaveLength(1)
  })
})
