import { describe, expect, it } from "vitest"
import { MigrationRegistry, equivalent } from "@checkout-studio/schema"

import { fromSchema, toJson, toSchema } from "../../src/state/projection"
import { makeStore, sampleDocument } from "./support"

/**
 * The store and storage.
 *
 * `toSchema` is the only path out and `fromSchema` the only path in. Anything
 * else would let UI state reach the database, which docs/schema.md forbids —
 * and a selection saved into a page is somebody else's selection when they open
 * it.
 */

describe("toSchema", () => {
  it("returns the document and nothing else", () => {
    const { store, state } = makeStore()

    store.getState().select(["heading"])
    store.getState().setZoom(2)
    store.getState().beginDrag(["heading"])
    store.getState().copy()

    expect(toSchema(state())).toBe(state().document)
    expect(Object.keys(toSchema(state())).sort()).toEqual([
      "nodes",
      "pageId",
      "projectId",
      "root",
      "settings",
      "theme",
      "variables",
      "version",
    ])
  })

  it("carries no selection, viewport, history, clipboard or drag state", () => {
    const { store, state } = makeStore()

    store.getState().select(["heading"])
    store.getState().setProps("heading", { text: "Hello" })
    store.getState().copy()
    store.getState().beginDrag(["heading"])

    const json = toJson(state())

    expect(json).not.toMatch(/selection|viewport|history|clipboard|drag|zoom|breakpoint/)
  })
})

describe("round trip", () => {
  it("survives state → JSON → state exactly", () => {
    const { store, state } = makeStore()

    store.getState().setProps("heading", { text: "Hello" })
    store.getState().setStyles(["heading"], { color: "red" })

    const json = toJson(state())
    const restored = fromSchema(JSON.parse(json))

    expect(restored.ok).toBe(true)
    expect(restored.ok && equivalent(restored.document, state().document)).toBe(true)
  })

  it("emits no functions, class instances or DOM references", () => {
    const { store, state } = makeStore()

    store.getState().select(["heading"])
    store.getState().copy()

    const json = toJson(state())

    expect(json).not.toMatch(/function|\[object |=>/)
    expect(() => JSON.parse(json)).not.toThrow()
  })

  it("is key-order independent", () => {
    const { state } = makeStore()
    const shuffled = {
      nodes: state().document.nodes,
      root: state().document.root,
      version: state().document.version,
      theme: state().document.theme,
      settings: state().document.settings,
      variables: state().document.variables,
      pageId: state().document.pageId,
      projectId: state().document.projectId,
    }

    expect(toJson({ ...state(), document: shuffled as never })).toBe(toJson(state()))
  })

  it("loads a document back into a store", () => {
    const { store, state } = makeStore()

    store.getState().setProps("heading", { text: "Hello" })
    const saved = JSON.parse(toJson(state())) as unknown

    const other = makeStore()
    const loaded = fromSchema(saved)

    expect(loaded.ok).toBe(true)

    if (loaded.ok) other.store.getState().load(loaded.document, 7)

    expect(other.state().document.nodes["heading"]?.props["text"]).toBe("Hello")
    expect(other.state().persistence.baseVersion).toBe(7)
  })
})

describe("load", () => {
  // A different page is a different history. Offering an undo back into the
  // previous page would be a way to save one page's content over another's.
  it("clears history", () => {
    const { store, state } = makeStore()

    store.getState().setProps("heading", { text: "Hello" })

    expect(state().history.past).toHaveLength(1)

    store.getState().load(sampleDocument())

    expect(state().history.past).toEqual([])
    expect(store.getState().undo()).toBe(false)
  })

  it("clears the selection", () => {
    const { store, state } = makeStore()

    store.getState().select(["heading"])
    store.getState().load(sampleDocument())

    expect(state().selection.ids).toEqual([])
  })

  // How somebody is looking at a page is theirs, not the page's.
  it("keeps the viewport", () => {
    const { store, state } = makeStore()

    store.getState().setZoom(2)
    store.getState().setBreakpoint("mobile")
    store.getState().load(sampleDocument())

    expect(state().viewport.zoom).toBe(2)
    expect(state().viewport.breakpoint).toBe("mobile")
  })

  it("starts clean", () => {
    const { store, state } = makeStore()

    store.getState().setProps("heading", { text: "Hello" })
    store.getState().load(sampleDocument())

    expect(state().persistence.status).toBe("saved")
  })
})

describe("fromSchema", () => {
  it("reports why a document was refused", () => {
    const result = fromSchema({ ...sampleDocument(), root: "nowhere" })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.errors[0]?.code).toBe("missing-root")
  })

  it("migrates when given a registry", () => {
    const registry = new MigrationRegistry("1.1.0", [
      { from: "1.0.0", to: "1.1.0", migrate: (document) => document },
    ])
    const result = fromSchema(sampleDocument(), registry)

    expect(result.ok && result.document.version).toBe("1.1.0")
  })
})
