import { applyPatch } from "fast-json-patch"
import { createDocument, serialize, type CheckoutSchema, type Node } from "@checkout-studio/schema"
import { describe, expect, it } from "vitest"

import { MAXIMUM_PATCH_OPERATIONS, patchBetween } from "../../src/state/wire"
import { createEditorStore } from "../../src/state/store"

/**
 * The wire format for a draft write.
 *
 * The property that matters is the round trip: the server applies what this
 * produces, so a patch that describes the change inaccurately corrupts the
 * draft rather than failing. Every test here applies the patch and compares the
 * result against the document it was computed from.
 */

function blank(): CheckoutSchema {
  return createDocument({
    projectId: "prj_test",
    pageId: "pag_test",
    themeId: "theme_default",
    random: () => 0.5,
  })
}

/** What the server does with the patch: apply it to its own copy. */
function applied(base: CheckoutSchema, operations: readonly unknown[]): CheckoutSchema {
  return applyPatch(
    structuredClone(base) as unknown as Record<string, unknown>,
    structuredClone(operations) as Parameters<typeof applyPatch>[1],
    true,
    false,
  ).newDocument as unknown as CheckoutSchema
}

function storeWith(document: CheckoutSchema) {
  return createEditorStore({ document, baseVersion: 1 })
}

/**
 * A document with `count` children, built directly.
 *
 * Not through the store: five thousand inserts is five thousand Immer produces
 * and five thousand history entries, which took eight seconds and timed out as
 * soon as anything else was running. What this test needs is a big document,
 * not a record of how it was made.
 */
function wide(count: number): CheckoutSchema {
  const base = blank()
  const root = base.nodes[base.root] as Node
  const ids = Array.from({ length: count }, (_, index) => `n${index}`)
  const nodes: Record<string, Node> = {
    [base.root]: { ...root, children: ids },
  }

  for (const id of ids) {
    nodes[id] = {
      id,
      type: "core.section",
      parentId: base.root,
      children: [],
      props: {},
      styles: {},
      visibility: { hidden: false },
      animations: [],
      metadata: { locked: false },
    }
  }

  return { ...base, nodes }
}

describe("patchBetween", () => {
  it("is empty for a document that did not change", () => {
    const document = blank()

    // The ordinary case on a page somebody is reading. The API refuses an empty
    // patch, so the caller has to be able to tell.
    expect(patchBetween(document, document).operations).toEqual([])
    expect(patchBetween(document, structuredClone(document)).operations).toEqual([])
  })

  it("round-trips an inserted node", () => {
    const base = blank()
    const store = storeWith(base)

    store.getState().insertNew("core.section", base.root)

    const next = store.getState().document
    const { operations } = patchBetween(base, next)

    expect(operations.length).toBeGreaterThan(0)
    expect(serialize(applied(base, operations))).toBe(serialize(next))
  })

  it("round-trips a removed node", () => {
    const base = blank()
    const store = storeWith(base)
    const inserted = store.getState().insertNew("core.section", base.root)

    expect(inserted.ok).toBe(true)

    const withNode = store.getState().document

    store.getState().remove([Object.keys(withNode.nodes).filter((id) => id !== withNode.root)[0]!])

    const next = store.getState().document

    expect(serialize(applied(withNode, patchBetween(withNode, next).operations))).toBe(
      serialize(next),
    )
  })

  it("round-trips a reorder, which is an array edit rather than a value edit", () => {
    const base = blank()
    const store = storeWith(base)

    store.getState().insertNew("core.section", base.root)
    store.getState().insertNew("core.section", base.root)

    const two = store.getState().document
    const children = two.nodes[two.root]?.children ?? []

    expect(children).toHaveLength(2)

    store.getState().move(children[1]!, two.root, 0)

    const next = store.getState().document

    expect(serialize(applied(two, patchBetween(two, next).operations))).toBe(serialize(next))
  })

  it("round-trips a renamed node", () => {
    const base = blank()
    const store = storeWith(base)

    store.getState().rename(base.root, "Checkout")

    const next = store.getState().document
    const { operations } = patchBetween(base, next)

    // One property moved, so one operation: this is the reason the wire format
    // is a patch and not the document.
    expect(operations).toHaveLength(1)
    expect(serialize(applied(base, operations))).toBe(serialize(next))
  })

  it("sends only what changed, not the nodes around it", () => {
    const many = wide(50)
    const store = storeWith(many)
    const target = Object.keys(many.nodes).filter((id) => id !== many.root)[0]

    store.getState().rename(target!, "Only this one")

    const { operations } = patchBetween(many, store.getState().document)

    // Fifty nodes in the document, one of them touched. docs/performance.md
    // asks for only changed data on the wire, and this is what that means.
    expect(operations).toHaveLength(1)
    expect(operations[0]?.path).toContain(target)
  })

  it("does not mutate either document", () => {
    const base = blank()
    const store = storeWith(base)

    store.getState().rename(base.root, "Checkout")

    const next = store.getState().document
    const before = serialize(base)
    const after = serialize(next)

    patchBetween(base, next)

    // The store's document is frozen by Immer, and the base is the copy the
    // caller is still holding as the server's version.
    expect(serialize(base)).toBe(before)
    expect(serialize(next)).toBe(after)
  })

  it("reports a patch the API would refuse as too large", () => {
    // Each added node is an operation, plus one for the root's children.
    const { operations, tooLarge } = patchBetween(blank(), wide(MAXIMUM_PATCH_OPERATIONS))

    expect(operations.length).toBeGreaterThan(MAXIMUM_PATCH_OPERATIONS)
    expect(tooLarge).toBe(true)
  })

  it("does not call an ordinary edit too large", () => {
    const base = blank()
    const store = storeWith(base)

    store.getState().insertNew("core.section", base.root)

    expect(patchBetween(base, store.getState().document).tooLarge).toBe(false)
  })
})
