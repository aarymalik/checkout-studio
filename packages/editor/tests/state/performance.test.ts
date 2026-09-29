import { describe, expect, it } from "vitest"

import { HISTORY_LIMIT } from "../../src/state/history"
import { makeStore, wideDocument } from "./support"

/**
 * The targets from docs/phases.md, Phase 5.
 *
 * Timing in a test is a blunt instrument — a loaded machine makes any threshold
 * arbitrary. These are set well clear of the budget so they fail on a change of
 * complexity rather than on a busy afternoon: an O(n) operation that becomes
 * O(n²) crosses them by orders of magnitude, which is the regression worth
 * catching.
 */

const NODES = 2_000

/** The median of several runs, so one unlucky pause does not decide it. */
function medianMs(runs: number, act: () => void): number {
  const samples: number[] = []

  for (let run = 0; run < runs; run += 1) {
    const started = performance.now()
    act()
    samples.push(performance.now() - started)
  }

  return samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)] as number
}

describe("a two thousand node tree", () => {
  it("updates one node in well under 16ms", () => {
    const { store, advance } = makeStore(wideDocument(NODES))
    let index = 0

    const median = medianMs(50, () => {
      advance(1_000)
      store.getState().setProps("leaf5", { text: `v${(index += 1)}` })
    })

    expect(median).toBeLessThan(16)
  })

  it("undoes in well under 50ms", () => {
    const { store, advance } = makeStore(wideDocument(NODES))

    for (let step = 0; step < 20; step += 1) {
      advance(1_000)
      store.getState().setProps("leaf5", { text: `v${step}` })
    }

    const median = medianMs(10, () => {
      store.getState().undo()
      store.getState().redo()
    })

    expect(median).toBeLessThan(50)
  })

  it("inserts into a large parent in well under 16ms", () => {
    const { store, advance } = makeStore(wideDocument(NODES))

    const median = medianMs(20, () => {
      advance(1_000)
      store.getState().insertNew("core.text", "root")
    })

    expect(median).toBeLessThan(16)
  })
})

describe("structural sharing", () => {
  /*
   * The whole case for snapshots over patches. Changing one node must leave
   * every other node object identical by reference — otherwise each history
   * entry is a copy of the page, and fifty of them is fifty pages.
   */
  it("keeps every untouched node object identical after an edit", () => {
    const { store, state } = makeStore(wideDocument(NODES))
    const before = state().document.nodes

    store.getState().setProps("leaf5", { text: "changed" })

    const after = state().document.nodes
    const shared = Object.keys(before).filter((id) => before[id] === after[id])

    expect(shared).toHaveLength(NODES)
    expect(before["leaf5"]).not.toBe(after["leaf5"])
  })

  it("keeps history entries sharing their untouched nodes", () => {
    const { store, state, advance } = makeStore(wideDocument(NODES))

    for (let step = 0; step < HISTORY_LIMIT; step += 1) {
      advance(1_000)
      store.getState().setProps("leaf5", { text: `v${step}` })
    }

    expect(state().history.past).toHaveLength(HISTORY_LIMIT)

    const first = state().history.past[0]?.document.nodes
    const last = state().history.past.at(-1)?.document.nodes

    // Every leaf but the edited one is the same object in the oldest entry and
    // the newest, fifty edits apart.
    const shared = Object.keys(first ?? {}).filter((id) => first?.[id] === last?.[id])

    expect(shared.length).toBeGreaterThanOrEqual(NODES)
  })
})

describe("selector stability", () => {
  /*
   * Updating one node must not invalidate a subscription that has nothing to do
   * with it. Zustand compares by reference, so an unrelated slice staying
   * identical is exactly what stops the whole canvas re-rendering.
   */
  it("leaves unrelated slices identical after a node edit", () => {
    const { store, state } = makeStore(wideDocument(NODES))
    const before = state()

    store.getState().setProps("leaf5", { text: "changed" })

    const after = state()

    expect(after.selection).toBe(before.selection)
    expect(after.viewport).toBe(before.viewport)
    expect(after.clipboard).toBe(before.clipboard)
    expect(after.drag).toBe(before.drag)
  })

  it("leaves the document identical after a selection change", () => {
    const { store, state } = makeStore(wideDocument(NODES))
    const before = state().document

    store.getState().select(["leaf5"])

    expect(state().document).toBe(before)
  })

  it("leaves the document identical after a viewport change", () => {
    const { store, state } = makeStore(wideDocument(NODES))
    const before = state().document

    store.getState().setZoom(2)
    store.getState().setBreakpoint("mobile")

    expect(state().document).toBe(before)
  })

  it("leaves other nodes' objects identical, so their subscriptions hold", () => {
    const { store, state } = makeStore(wideDocument(NODES))
    const before = state().document.nodes["leaf900"]

    store.getState().setProps("leaf5", { text: "changed" })

    expect(state().document.nodes["leaf900"]).toBe(before)
  })
})
