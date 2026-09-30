import { describe, expect, it } from "vitest"

import { describeConflict } from "../../src/state/conflict"
import { makeNode, sampleDocument } from "./support"

/**
 * Describing a conflict.
 *
 * The server cannot: a draft write creates no revision, so nothing there can
 * reconstruct the version both sides started from. Only the session that made
 * the edits still holds it.
 */

function edited(text: string, node = "heading") {
  const document = sampleDocument()

  return {
    ...document,
    nodes: {
      ...document.nodes,
      [node]: { ...document.nodes[node], props: { text } },
    },
  } as ReturnType<typeof sampleDocument>
}

describe("describeConflict", () => {
  it("describes each side in the words the prompt shows", () => {
    const summary = describeConflict({
      base: sampleDocument(),
      mine: edited("Mine"),
      theirs: edited("Theirs", "text"),
    })

    expect(summary.theirChanges).toBe("1 node edited")
    expect(summary.yourChanges).toBe("1 node edited")
  })

  it("counts a section added on the other side", () => {
    const base = sampleDocument()
    const theirs = {
      ...base,
      nodes: {
        ...base.nodes,
        root: { ...base.nodes["root"], children: ["section", "footer", "extra"] },
        extra: makeNode("extra", { type: "core.section", parentId: "root" }),
      },
    } as ReturnType<typeof sampleDocument>

    expect(describeConflict({ base, mine: edited("Mine"), theirs }).theirChanges).toBe(
      "1 node added, 1 node edited",
    )
  })

  // Not used to decide anything: deciding is the person's job. It is what lets
  // the prompt say whether the two sides are even about the same part of the
  // page.
  it("reports the nodes both sides touched", () => {
    const summary = describeConflict({
      base: sampleDocument(),
      mine: edited("Mine"),
      theirs: edited("Theirs"),
    })

    expect(summary.overlapping).toEqual(["heading"])
  })

  it("reports no overlap when the two sides worked on different things", () => {
    const summary = describeConflict({
      base: sampleDocument(),
      mine: edited("Mine", "heading"),
      theirs: edited("Theirs", "text"),
    })

    expect(summary.overlapping).toEqual([])
  })

  it("says so when one side changed nothing", () => {
    const base = sampleDocument()

    expect(describeConflict({ base, mine: base, theirs: edited("Theirs") })).toMatchObject({
      yourChanges: "no changes",
      theirChanges: "1 node edited",
    })
  })
})
