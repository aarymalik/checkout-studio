import { describe, expect, it } from "vitest"

import { GROUP_WINDOW_MS, HISTORY_LIMIT } from "../../src/state/history"
import { makeStore, sampleDocument } from "./support"

/**
 * Undo and redo.
 *
 * The property that matters is exactness: undo must restore the state that was
 * there, not something that looks like it. Every case below compares documents
 * rather than spot-checking a field.
 */

describe("undo", () => {
  it("restores the exact prior state", () => {
    const { store, state } = makeStore()
    const before = state().document

    store.getState().setProps("heading", { text: "Hello" })

    expect(state().document).not.toBe(before)
    expect(store.getState().undo()).toBe(true)
    expect(state().document).toBe(before)
  })

  it("does nothing when there is nothing to undo", () => {
    const { store, state } = makeStore()
    const before = state().document

    expect(store.getState().undo()).toBe(false)
    expect(state().document).toBe(before)
  })

  it.each([
    [
      "add",
      (store: ReturnType<typeof makeStore>["store"]) =>
        store.getState().insertNew("core.text", "footer"),
    ],
    [
      "delete",
      (store: ReturnType<typeof makeStore>["store"]) => store.getState().remove(["heading"]),
    ],
    [
      "move",
      (store: ReturnType<typeof makeStore>["store"]) => store.getState().move("heading", "footer"),
    ],
    [
      "duplicate",
      (store: ReturnType<typeof makeStore>["store"]) => store.getState().duplicate(["heading"]),
    ],
    [
      "style",
      (store: ReturnType<typeof makeStore>["store"]) =>
        store.getState().setStyles(["heading"], { color: "red" }),
    ],
    [
      "theme",
      (store: ReturnType<typeof makeStore>["store"]) => store.getState().setTheme("theme_other"),
    ],
    [
      "responsive",
      (store: ReturnType<typeof makeStore>["store"]) =>
        store.getState().setStyles(["heading"], { fontSize: 24 }, { breakpoint: "mobile" }),
    ],
    [
      "lock",
      (store: ReturnType<typeof makeStore>["store"]) =>
        store.getState().setLocked(["heading"], true),
    ],
    [
      "hide",
      (store: ReturnType<typeof makeStore>["store"]) =>
        store.getState().setHidden(["heading"], true),
    ],
    [
      "rename",
      (store: ReturnType<typeof makeStore>["store"]) => store.getState().rename("heading", "Title"),
    ],
    [
      "group",
      (store: ReturnType<typeof makeStore>["store"]) =>
        store.getState().wrap(["heading", "text"], "core.container"),
    ],
    [
      "ungroup",
      (store: ReturnType<typeof makeStore>["store"]) => store.getState().unwrap("section"),
    ],
  ])("undoes %s exactly", (_name, act) => {
    const { store, state } = makeStore()
    const before = state().document

    act(store)

    expect(state().document).not.toBe(before)
    expect(store.getState().undo()).toBe(true)
    expect(state().document).toBe(before)
  })

  it("restores the selection as it was", () => {
    const { store, state } = makeStore()

    store.getState().select(["heading"])
    store.getState().remove(["heading"])

    expect(state().selection.ids).toEqual([])

    store.getState().undo()

    expect(state().selection.ids).toEqual(["heading"])
  })

  // Nothing happened, so there is nothing to undo — and the undo must not eat
  // the entry before it.
  it("is a no-op after an operation that failed", () => {
    const { store, state } = makeStore()

    store.getState().setProps("heading", { text: "Hello" })
    const afterEdit = state().document

    const failed = store.getState().move("section", "heading")

    expect(failed.ok).toBe(false)
    expect(state().document).toBe(afterEdit)
    expect(state().history.past).toHaveLength(1)

    store.getState().undo()

    expect(state().document).toEqual(sampleDocument())
  })

  it("discards the oldest beyond the cap", () => {
    const { store, state, advance } = makeStore()

    for (let index = 0; index < HISTORY_LIMIT + 10; index += 1) {
      advance(GROUP_WINDOW_MS + 1)
      store.getState().setProps("heading", { text: `v${index}` })
    }

    expect(state().history.past).toHaveLength(HISTORY_LIMIT)
  })

  it("still undoes after the cap has been reached", () => {
    const { store, state, advance } = makeStore()

    for (let index = 0; index < HISTORY_LIMIT + 10; index += 1) {
      advance(GROUP_WINDOW_MS + 1)
      store.getState().setProps("heading", { text: `v${index}` })
    }

    store.getState().undo()

    expect(state().document.nodes["heading"]?.props["text"]).toBe(`v${HISTORY_LIMIT + 8}`)
  })
})

describe("redo", () => {
  it("restores the undone state exactly", () => {
    const { store, state } = makeStore()

    store.getState().setProps("heading", { text: "Hello" })
    const edited = state().document

    store.getState().undo()

    expect(store.getState().redo()).toBe(true)
    expect(state().document).toBe(edited)
  })

  it("does nothing when there is nothing to redo", () => {
    const { store } = makeStore()

    expect(store.getState().redo()).toBe(false)
  })

  // Keeping it would offer a redo into a future that no longer follows from
  // the present.
  it("is cleared by a new action", () => {
    const { store, state, advance } = makeStore()

    store.getState().setProps("heading", { text: "Hello" })
    store.getState().undo()

    expect(state().history.future).toHaveLength(1)

    advance(GROUP_WINDOW_MS + 1)
    store.getState().setProps("text", { text: "Something else" })

    expect(state().history.future).toEqual([])
    expect(store.getState().redo()).toBe(false)
  })

  it("round-trips several steps", () => {
    const { store, state, advance } = makeStore()
    const start = state().document

    advance(GROUP_WINDOW_MS + 1)
    store.getState().setProps("heading", { text: "one" })
    advance(GROUP_WINDOW_MS + 1)
    store.getState().setProps("heading", { text: "two" })
    const end = state().document

    store.getState().undo()
    store.getState().undo()

    expect(state().document).toBe(start)

    store.getState().redo()
    store.getState().redo()

    expect(state().document).toBe(end)
  })
})

describe("grouping", () => {
  // Typing "Hello" is one undo step, not five.
  it("collapses rapid edits to the same node", () => {
    const { store, state } = makeStore()

    for (const text of ["H", "He", "Hel", "Hell", "Hello"]) {
      store.getState().setProps("heading", { text })
    }

    expect(state().history.past).toHaveLength(1)

    store.getState().undo()

    expect(state().document.nodes["heading"]?.props["text"]).toBeUndefined()
  })

  it("collapses ten rapid nudges into one step", () => {
    const { store, state } = makeStore()

    for (let index = 0; index < 10; index += 1) {
      store.getState().setStyles(["heading"], { top: index })
    }

    expect(state().history.past).toHaveLength(1)

    store.getState().undo()

    expect(state().document.nodes["heading"]?.styles).toEqual({})
  })

  it("starts a new entry after a pause", () => {
    const { store, state, advance } = makeStore()

    store.getState().setProps("heading", { text: "one" })
    advance(GROUP_WINDOW_MS + 1)
    store.getState().setProps("heading", { text: "two" })

    expect(state().history.past).toHaveLength(2)
  })

  it("starts a new entry for a different node", () => {
    const { store, state } = makeStore()

    store.getState().setProps("heading", { text: "one" })
    store.getState().setProps("text", { text: "two" })

    expect(state().history.past).toHaveLength(2)
  })

  it("never groups an action that has no group key", () => {
    const { store, state } = makeStore()

    store.getState().setLocked(["heading"], true)
    store.getState().setLocked(["heading"], false)

    expect(state().history.past).toHaveLength(2)
  })

  it("keeps the earliest state in a group, which is what one undo returns to", () => {
    const { store, state } = makeStore()
    const start = state().document

    store.getState().setProps("heading", { text: "a" })
    store.getState().setProps("heading", { text: "ab" })
    store.getState().setProps("heading", { text: "abc" })
    store.getState().undo()

    expect(state().document).toBe(start)
  })
})

describe("transactions", () => {
  it("makes several mutations one undo step", () => {
    const { store, state } = makeStore()
    const start = state().document

    store.getState().transact("Restructure", () => {
      store.getState().insertNew("core.text", "footer")
      store.getState().move("heading", "footer")
      store.getState().setProps("text", { text: "x" })
    })

    expect(state().history.past).toHaveLength(1)
    expect(state().history.past[0]?.label).toBe("Restructure")

    store.getState().undo()

    expect(state().document).toBe(start)
  })

  it("returns whatever the body returned", () => {
    const { store } = makeStore()

    expect(store.getState().transact("Thing", () => 42)).toBe(42)
  })

  it("writes no entry when nothing changed", () => {
    const { store, state } = makeStore()

    store.getState().transact("Nothing", () => undefined)

    expect(state().history.past).toEqual([])
  })

  it("writes no entry when every operation inside failed", () => {
    const { store, state } = makeStore()

    store.getState().transact("Impossible", () => {
      store.getState().move("section", "heading")
      store.getState().remove(["nowhere"])
    })

    expect(state().history.past).toEqual([])
    expect(state().document).toEqual(sampleDocument())
  })

  // A transaction inside a transaction is one thing the person did, not two.
  it("counts nested transactions as one", () => {
    const { store, state } = makeStore()

    store.getState().transact("Outer", () => {
      store.getState().transact("Inner", () => {
        store.getState().setProps("heading", { text: "a" })
      })
      store.getState().setProps("text", { text: "b" })
    })

    expect(state().history.past).toHaveLength(1)
    expect(state().history.past[0]?.label).toBe("Outer")
  })

  it("closes the transaction even when the body throws", () => {
    const { store, state } = makeStore()

    expect(() =>
      store.getState().transact("Doomed", () => {
        store.getState().setProps("heading", { text: "a" })
        throw new Error("boom")
      }),
    ).toThrow("boom")

    expect(state().history.transactionDepth).toBe(0)
    // What ran before the throw is kept, and is undoable as one step.
    expect(state().history.past).toHaveLength(1)
  })
})
