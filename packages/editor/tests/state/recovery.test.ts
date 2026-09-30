import { describe, expect, it } from "vitest"

import { findProblems, inspect, isValid, walkBack } from "../../src/state/recovery"
import type { HistoryEntry } from "../../src/state/types"
import { makeNode, sampleDocument } from "./support"

/**
 * Corruption recovery.
 *
 * The document is rebuilt rather than repaired: repairing means guessing at
 * intent, and a guess about somebody's page is a guess that changes it.
 */

function entry(
  document: ReturnType<typeof sampleDocument>,
  selection: string[] = [],
): HistoryEntry {
  return { document, selection, label: "Edit", groupKey: null, at: 0 }
}

/** A document with a node nothing can reach. */
function corrupted(): ReturnType<typeof sampleDocument> {
  const document = sampleDocument()

  return {
    ...document,
    nodes: { ...document.nodes, lost: makeNode("lost", { type: "core.text" }) },
  }
}

describe("detection", () => {
  it("passes a document that holds together", () => {
    expect(isValid(sampleDocument())).toBe(true)
    expect(findProblems(sampleDocument())).toEqual([])
  })

  it.each([
    ["an orphan", corrupted],
    [
      "a cycle",
      () => {
        const document = sampleDocument()

        return {
          ...document,
          nodes: {
            ...document.nodes,
            section: { ...document.nodes["section"], parentId: "heading" },
            heading: { ...document.nodes["heading"], children: ["section"] },
          },
        } as ReturnType<typeof sampleDocument>
      },
    ],
    [
      "a missing root",
      () => ({ ...sampleDocument(), root: "nowhere" }) as ReturnType<typeof sampleDocument>,
    ],
    [
      "a node in two places",
      () => {
        const document = sampleDocument()

        return {
          ...document,
          nodes: {
            ...document.nodes,
            footer: { ...document.nodes["footer"], children: ["heading"] },
          },
        } as ReturnType<typeof sampleDocument>
      },
    ],
  ])("catches %s", (_name, build) => {
    expect(isValid(build())).toBe(false)
  })

  it("names the nodes at fault", () => {
    expect(findProblems(corrupted())[0]?.nodeIds).toEqual(["lost"])
  })
})

describe("walking back", () => {
  // A corrupted document usually means the operation that produced it was
  // wrong, and the state before it was fine.
  it("finds the most recent valid state", () => {
    const good = sampleDocument()
    const recovery = walkBack([entry(corrupted()), entry(good, ["heading"])])

    expect(recovery).toMatchObject({ outcome: "restored", stepsBack: 1, selection: ["heading"] })
    expect(recovery.outcome === "restored" && recovery.document).toBe(good)
  })

  it("keeps walking past states that are also broken", () => {
    const good = sampleDocument()
    const recovery = walkBack([entry(good), entry(corrupted()), entry(corrupted())])

    expect(recovery).toMatchObject({ outcome: "restored", stepsBack: 3 })
  })

  it("gives up when nothing in history is valid", () => {
    expect(walkBack([entry(corrupted()), entry(corrupted())])).toEqual({ outcome: "exhausted" })
  })

  it("gives up when there is no history at all", () => {
    expect(walkBack([])).toEqual({ outcome: "exhausted" })
  })
})

describe("inspect", () => {
  // The ordinary answer, on every mutation.
  it("says nothing about a document that is fine", () => {
    expect(inspect(sampleDocument(), [], 1_000)).toBeNull()
  })

  it("reports what is wrong and what to do about it", () => {
    const broken = corrupted()
    const report = inspect(broken, [entry(sampleDocument())], 1_000)

    expect(report?.corruption.problems[0]?.code).toBe("orphan")
    expect(report?.recovery.outcome).toBe("restored")
  })

  /*
   * We never delete a document we cannot read. It is the only copy of what the
   * person was doing, and they may be able to export it even when nothing can
   * load it.
   */
  it("keeps the corrupted document, whatever happens next", () => {
    const broken = corrupted()

    expect(inspect(broken, [], 1_000)?.corruption).toEqual({
      document: broken,
      problems: findProblems(broken),
      at: 1_000,
    })
  })

  it("reports that history held nothing to fall back to", () => {
    expect(inspect(corrupted(), [], 1_000)?.recovery).toEqual({ outcome: "exhausted" })
  })
})
