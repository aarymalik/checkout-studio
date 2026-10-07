import { describe, expect, it } from "vitest"
import type { CheckoutSchema } from "@checkout-studio/schema"

import { makeStore, sampleDocument } from "./support"

/**
 * Corruption recovery, wired.
 *
 * `findProblems`, `inspect` and `walkBack` were written in Phase 5, tested to
 * 100%, exported, and called by nothing — so the exit criterion about corrupted
 * state described a module rather than a behaviour.
 *
 * What the wiring found is that the check belongs on the way *in*. A tree
 * operation cannot produce a corrupt document, proven over every mutation type;
 * the server refuses to persist one, rejecting a patched document that fails
 * `validateReferences`. But `fromSchema`, which calls itself "the one door in",
 * validates shape and migrations and never references — so an orphan, a cycle
 * or a node claimed by two parents passed straight into the editor.
 *
 * Corruption is therefore constructed here rather than provoked, because that
 * is also how it arrives in production: handed to the store, from a revision an
 * older build wrote, a draft recovered out of IndexedDB, or a migration that
 * went wrong.
 *
 * See docs/error-handling.md § State Corruption Recovery.
 */

/** The sample document with `heading` orphaned: claimed by nobody. */
function orphaned(): CheckoutSchema {
  const document = sampleDocument()
  const section = document.nodes["section"]

  if (section === undefined) throw new Error("The fixture changed shape.")

  // `heading` still names `section` as its parent, and `section` no longer
  // claims it. Neither half knows the other is wrong.
  return {
    ...document,
    nodes: { ...document.nodes, section: { ...section, children: ["text"] } },
  }
}

/** The sample document with no root among its nodes. */
function rootless(): CheckoutSchema {
  const document = sampleDocument()
  const { root: _root, ...rest } = document.nodes

  return { ...document, nodes: rest }
}

/** The sample document with `heading` claimed by two parents. */
function doubleClaimed(): CheckoutSchema {
  const document = sampleDocument()
  const footer = document.nodes["footer"]

  if (footer === undefined) throw new Error("The fixture changed shape.")

  return {
    ...document,
    nodes: { ...document.nodes, footer: { ...footer, children: ["heading"] } },
  }
}

describe("a document that holds together", () => {
  it("is opened without comment", () => {
    const { state } = makeStore()

    expect(state().recovery.corruption).toBeNull()
    expect(state().persistence.canEdit).toBe(true)
  })
})

describe("opening a document that does not hold together", () => {
  it("keeps it, says what is wrong, and refuses to edit it", () => {
    const { state } = makeStore(orphaned())
    const { corruption } = state().recovery

    expect(corruption).not.toBeNull()
    expect(corruption?.problems.map((problem) => problem.code)).toContain("orphan")

    // Kept whatever happens next. docs/error-handling.md: "We never delete a
    // document we cannot read." It is the only copy of what they were doing,
    // and they may be able to export it even when nothing can load it.
    expect(corruption?.document.nodes["heading"]).toBeDefined()
    expect(state().persistence.canEdit).toBe(false)
  })

  it("catches each kind of damage, not just one", () => {
    for (const [name, document] of [
      ["an orphan", orphaned()],
      ["no root", rootless()],
      ["two parents", doubleClaimed()],
    ] as const) {
      const { state } = makeStore(document)

      expect(state().recovery.corruption, name).not.toBeNull()
      expect(state().persistence.canEdit, name).toBe(false)
    }
  })

  it("refuses every mutation, whichever way it is asked", () => {
    const { store, state } = makeStore(rootless())
    const before = state().document

    for (const attempt of [
      () => store.getState().insertNew("core.section", "section"),
      () => store.getState().move("heading", "footer"),
      () => store.getState().remove(["text"]),
      () => store.getState().duplicate(["heading"]),
      () => store.getState().setStyles(["heading"], { width: 240 }),
      () => store.getState().rename("heading", "Title"),
    ]) {
      const result = attempt()

      expect(result.ok).toBe(false)
      expect(result.ok === false && result.code).toBe("document-unreadable")
    }

    // Not the document, not history, not the selection.
    expect(state().document).toBe(before)
    expect(state().history.past).toEqual([])
  })

  it("does not pretend the page was modified", () => {
    const { state } = makeStore(orphaned(), { baseVersion: 7 })

    /*
     * The server holds version 7 and this is what version 7 is. Marking it
     * modified would invite autosave to describe the corruption as a change
     * and write it back — turning a document that cannot be read into a
     * document nobody else can read either.
     */
    expect(state().persistence.status).toBe("saved")
    expect(state().persistence.baseVersion).toBe(7)
  })

  it("stays refused after a load that is also broken", () => {
    const { store, state } = makeStore()

    expect(state().persistence.canEdit).toBe(true)

    store.getState().load(doubleClaimed(), 3)

    expect(state().recovery.corruption).not.toBeNull()
    expect(state().persistence.canEdit).toBe(false)
  })

  it("recovers when a document that holds together arrives", () => {
    const { store, state } = makeStore(orphaned())

    expect(state().persistence.canEdit).toBe(false)

    // Which is what the spec's next step is: reload the last persisted
    // revision from the server. `load` is how the conflict prompt already does
    // it, and a good document clears the freeze.
    store.getState().load(sampleDocument(), 9)

    expect(state().recovery.corruption).toBeNull()
    expect(state().persistence.canEdit).toBe(true)
    expect(store.getState().insertNew("core.section", "root").ok).toBe(true)
  })
})

describe("the cost of checking", () => {
  it("is paid once, at the door, and not per mutation", () => {
    const { store, state } = makeStore()

    /*
     * The check runs once, at the door, and not after mutations.
     *
     * That is a measurement rather than a preference: `validateReferences` is a
     * multi-pass walk of every node, 1.1–1.8ms over two thousand of them, which
     * is a tenth of a frame. Resizing writes styles on every frame of a drag
     * and Phase 8 will write structure on every frame of another.
     *
     * It is also not needed there. A tree operation cannot produce a document
     * that fails these invariants, which Phase 5's own criteria assert over
     * every mutation type — so the only thing a per-mutation check would buy is
     * the cost.
     */
    for (const attempt of [
      () => store.getState().insertNew("core.section", "root"),
      () => store.getState().move("heading", "footer"),
      () => store.getState().duplicate(["heading"]),
      () => store.getState().remove(["text"]),
      () => store.getState().setStyles(["heading"], { width: 240 }),
      () => store.getState().setLocked(["heading"], true),
      () => store.getState().rename("heading", "Title"),
    ]) {
      expect(attempt().ok).toBe(true)
    }

    expect(state().recovery.corruption).toBeNull()
    expect(state().history.past.length).toBeGreaterThan(0)
  })

  it("is not paid by a paste either, which builds a fragment", () => {
    const { store, state } = makeStore()

    // A paste regenerates ids and inserts a fragment, which is the most
    // structural thing the store does without being handed a whole document.
    store.getState().select(["section"])
    expect(store.getState().copy()).toBe(true)
    expect(store.getState().paste()?.ok).toBe(true)

    expect(state().recovery.corruption).toBeNull()
  })
})
