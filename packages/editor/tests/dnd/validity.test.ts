import { describe, expect, it } from "vitest"

import { canDrop, canInsert, dropRejection, insertRejection } from "../../src/dnd/validity"
import { documentOf } from "../documents"

/**
 * Whether something may be dropped where the pointer is, and why not.
 *
 * Phase 8's exit criteria are that no drag can produce an invalid tree and that
 * every rejection explains itself. The second is the one worth testing
 * carefully: a refusal with no reason is a drag that fails and teaches nothing,
 * and a reason naming `nod_8f2a` teaches nothing either.
 *
 * The schema's own rules are called rather than restated — `moveRefusal` is the
 * function `move` itself uses — so these tests also pin that the reason shown
 * while dragging is the reason the operation would give.
 */

/**
 * page
 *  ├── section ── heading
 *  ├── locked (locked) ── inner
 *  └── leaf
 */
function tree() {
  return documentOf("page", [
    { id: "page", type: "core.page", children: ["section", "locked", "leaf"] },
    { id: "section", type: "core.section", children: ["heading"], name: "Hero" },
    { id: "heading", type: "core.heading", name: "Title" },
    { id: "locked", type: "core.section", children: ["inner"], locked: true, name: "Footer" },
    { id: "inner", type: "core.text", name: "Small print" },
    { id: "leaf", type: "core.text", name: "Note" },
  ])
}

describe("a drop that is fine", () => {
  it("is not refused", () => {
    expect(dropRejection(tree(), ["heading"], "page")).toBeNull()
    expect(canDrop(tree(), ["heading"], "page")).toBe(true)
  })
})

describe("into itself", () => {
  it("is refused, and says so without jargon", () => {
    const rejection = dropRejection(tree(), ["section"], "section")

    expect(rejection?.code).toBe("cycle")
    expect(rejection?.message).toBe("Hero cannot be moved into itself.")
  })
})

describe("into its own descendant", () => {
  it("is refused", () => {
    const rejection = dropRejection(tree(), ["section"], "heading")

    // The same impossibility as dropping onto itself, and one check covers
    // both: `isDescendant` counts a node as its own descendant.
    expect(rejection?.code).toBe("cycle")
    expect(rejection?.message).toBe("Hero cannot be moved inside itself.")
  })
})

describe("into a locked parent", () => {
  it("is refused, because somebody locked it", () => {
    const rejection = dropRejection(tree(), ["leaf"], "locked")

    expect(rejection?.code).toBe("locked-destination")
    expect(rejection?.message).toBe("Footer is locked, so nothing can be moved into it.")
    expect(rejection?.nodeIds).toEqual(["locked"])
  })

  it("is refused for anything inside it too", () => {
    // `isLocked` is self-or-ancestor, so a locked container protects what is
    // inside it as well as itself.
    expect(dropRejection(tree(), ["leaf"], "inner")?.code).toBe("locked-destination")
  })
})

describe("a locked node", () => {
  it("cannot be dragged at all", () => {
    const rejection = dropRejection(tree(), ["locked"], "page")

    expect(rejection?.code).toBe("locked-source")
    expect(rejection?.message).toBe("Footer is locked, so it cannot be moved.")
  })

  it("cannot be dragged out of its locked container", () => {
    expect(dropRejection(tree(), ["inner"], "page")?.code).toBe("locked-source")
  })

  it("is reported before a cycle, because a lock is something a person did", () => {
    /*
     * Told "this is locked" a user knows what to do next. Told "that would make
     * a loop" about a locked node, they would unlock it and then hit the loop.
     * The order of the two checks is the difference.
     */
    expect(dropRejection(tree(), ["locked"], "locked")?.code).toBe("locked-destination")
  })
})

describe("into something that takes no children", () => {
  it("is refused, in the caller's terms", () => {
    const rejection = dropRejection(tree(), ["heading"], "leaf", {
      canHaveChildren: (node) => node.type !== "core.text",
    })

    expect(rejection?.code).toBe("rejects-children")
    expect(rejection?.message).toBe("Note does not take components.")
  })

  it("is allowed when the caller has no opinion", () => {
    // Omitted means yes, which is the only answer something that knows nothing
    // about components can honestly give.
    expect(canDrop(tree(), ["heading"], "leaf")).toBe(true)
  })
})

describe("the page itself", () => {
  it("cannot be dragged", () => {
    const rejection = dropRejection(tree(), ["page"], "section")

    expect(rejection?.code).toBe("root-immovable")
    expect(rejection?.message).toBe("The page itself cannot be moved.")
  })
})

describe("a node or a destination that is not there", () => {
  it("refuses a node the document does not contain", () => {
    const rejection = dropRejection(tree(), ["ghost"], "page")

    expect(rejection?.code).toBe("missing-node")
    expect(rejection?.message).toBe("ghost is no longer there.")
  })

  it("refuses a destination the document does not contain", () => {
    const rejection = dropRejection(tree(), ["leaf"], "ghost")

    expect(rejection?.code).toBe("missing-parent")
    expect(rejection?.message).toBe("That place is no longer there.")
  })
})

describe("several nodes at once", () => {
  it("is refused if any one of them cannot go", () => {
    // Partially moving a multiple selection is worse than refusing it: the user
    // can see that nothing happened and ask why.
    const rejection = dropRejection(tree(), ["heading", "page"], "section")

    expect(rejection?.code).toBe("root-immovable")
  })

  it("is allowed when all of them can", () => {
    expect(canDrop(tree(), ["heading", "leaf"], "section")).toBe(true)
  })
})

describe("naming things", () => {
  it("uses the caller's name for a node when it has one", () => {
    const rejection = dropRejection(tree(), ["leaf"], "locked", {
      nameOf: () => "the footer area",
    })

    expect(rejection?.message).toBe("the footer area is locked, so nothing can be moved into it.")
  })

  it("falls back to the id when a node has no name", () => {
    const document = documentOf("page", [
      { id: "page", type: "core.page", children: ["bare"] },
      { id: "bare", type: "core.section", locked: true },
    ])

    expect(dropRejection(document, ["bare"], "page")?.message).toBe(
      "bare is locked, so it cannot be moved.",
    )
  })
})

describe("adding a new component", () => {
  /**
   * A different question from moving one, which is why it is a different
   * function. There is no node yet, so no cycle and no locked source — what is
   * left is the destination.
   */
  it("is allowed into something that takes children", () => {
    expect(canInsert(tree(), "section")).toBe(true)
  })

  it("is refused by a locked destination", () => {
    const rejection = insertRejection(tree(), "locked")

    expect(rejection?.code).toBe("locked-destination")
    // "added to", not "moved into": nothing is being moved.
    expect(rejection?.message).toBe("Footer is locked, so nothing can be added to it.")
  })

  it("is refused by anything inside a locked destination", () => {
    expect(insertRejection(tree(), "inner")?.code).toBe("locked-destination")
  })

  it("is refused by something that takes no children", () => {
    /*
     * The reason this function exists rather than calling `dropRejection` with
     * no ids: that asks this question inside its per-id loop, so with nothing
     * being moved it never asks — and an insert into a heading would have been
     * allowed by a check that looked like it covered it.
     */
    const rejection = insertRejection(tree(), "leaf", {
      canHaveChildren: (node) => node.type !== "core.text",
    })

    expect(rejection?.code).toBe("rejects-children")
    expect(rejection?.message).toBe("Note does not take components.")
  })

  it("is refused by a destination that is not there", () => {
    expect(insertRejection(tree(), "ghost")?.code).toBe("missing-parent")
  })

  it("is allowed when the caller has no opinion about children", () => {
    expect(canInsert(tree(), "leaf")).toBe(true)
  })
})

describe("every rejection", () => {
  it("carries a code, a message and the nodes it is about", () => {
    const cases = [
      dropRejection(tree(), ["section"], "section"),
      dropRejection(tree(), ["leaf"], "locked"),
      dropRejection(tree(), ["locked"], "page"),
      dropRejection(tree(), ["page"], "section"),
      dropRejection(tree(), ["ghost"], "page"),
      dropRejection(tree(), ["leaf"], "ghost"),
      dropRejection(tree(), ["heading"], "leaf", { canHaveChildren: () => false }),
    ]

    for (const rejection of cases) {
      expect(rejection).not.toBeNull()
      expect(rejection?.message).not.toBe("")
      // A message that ends without a full stop is a fragment, and a fragment
      // in an interface reads as a bug.
      expect(rejection?.message).toMatch(/\.$/)
      expect(rejection?.nodeIds.length ?? 0).toBeGreaterThan(0)
    }
  })
})
