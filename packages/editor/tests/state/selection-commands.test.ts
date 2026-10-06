import { describe, expect, it } from "vitest"
import { createDocument } from "@checkout-studio/schema"

import { createSelectionCommands, selectionCommandDescriptors } from "../../src/state/selection"
import { createEditorStore, type EditorStoreApi } from "../../src/state/store"
import { makeContext } from "../support"

/**
 * Walking the tree with the keyboard.
 *
 * Phase 7's last exit criterion is "full canvas navigation by keyboard", and
 * the store has had the three actions behind it since Phase 5 with nothing
 * reaching them. What is tested here is that each key now goes somewhere, and
 * that each one stops rather than wraps when there is nowhere left to go — an
 * end you cannot feel is an end you have to count to find.
 *
 * Named for the commands rather than the module, because `selection.test.ts`
 * next door was already taken — by the tests for `selectors.ts`.
 */

/** A page with two sections, the first holding two children. */
function store(): EditorStoreApi {
  const api = createEditorStore({
    document: createDocument({
      projectId: "prj_test",
      pageId: "pag_test",
      themeId: "theme_default",
      random: () => 0.5,
    }),
    baseVersion: 1,
  })

  const root = api.getState().document.root

  api.getState().insertNew("core.section", root)
  api.getState().insertNew("core.section", root)

  const first = api.getState().document.nodes[root]?.children[0] as string

  api.getState().insertNew("core.section", first)
  api.getState().insertNew("core.section", first)
  api.getState().clearSelection()

  return api
}

function commandsFor(api: EditorStoreApi | null) {
  return new Map(
    createSelectionCommands({ store: () => api }).map((command) => [command.id, command]),
  )
}

const rootChildren = (api: EditorStoreApi): readonly string[] =>
  api.getState().document.nodes[api.getState().document.root]?.children ?? []

const childrenOf = (api: EditorStoreApi, id: string): readonly string[] =>
  api.getState().document.nodes[id]?.children ?? []

const selected = (api: EditorStoreApi): readonly string[] => api.getState().selection.ids

describe("with no page open", () => {
  it("reports everything unavailable and does nothing if run", () => {
    for (const command of commandsFor(null).values()) {
      expect(command.isAvailable(makeContext())).toBe(false)
      expect(() => command.run(makeContext())).not.toThrow()
    }
  })
})

describe("with nothing selected", () => {
  it("has nowhere to go from", () => {
    const api = store()

    // Every one of these acts from a selected node, which is also why the
    // bindings live in the `canvas.selection` scope.
    for (const command of commandsFor(api).values()) {
      expect(command.isAvailable(makeContext())).toBe(false)
    }
  })
})

describe("while a text field has focus", () => {
  it("declines, so Tab still leaves a rename field", () => {
    const api = store()

    api.getState().select([rootChildren(api)[0] as string])

    for (const command of commandsFor(api).values()) {
      expect(command.isAvailable(makeContext({ isEditingText: true }))).toBe(false)
    }
  })
})

describe("moving among siblings", () => {
  it("steps forward and back", () => {
    const api = store()
    const [first, second] = rootChildren(api) as [string, string]
    const commands = commandsFor(api)

    api.getState().select([first])
    commands.get("selection.next-sibling")?.run(makeContext())

    expect(selected(api)).toEqual([second])

    commands.get("selection.previous-sibling")?.run(makeContext())

    expect(selected(api)).toEqual([first])
  })

  it("stops at each end rather than wrapping", () => {
    const api = store()
    const [first, second] = rootChildren(api) as [string, string]
    const commands = commandsFor(api)

    api.getState().select([first])
    expect(commands.get("selection.previous-sibling")?.isAvailable(makeContext())).toBe(false)

    api.getState().select([second])
    expect(commands.get("selection.next-sibling")?.isAvailable(makeContext())).toBe(false)

    // Running anyway leaves the selection where it was.
    commands.get("selection.next-sibling")?.run(makeContext())
    expect(selected(api)).toEqual([second])
  })
})

describe("walking down and up", () => {
  it("enters a container and comes back out", () => {
    const api = store()
    const first = rootChildren(api)[0] as string
    const commands = commandsFor(api)

    api.getState().select([first])
    commands.get("selection.enter")?.run(makeContext())

    expect(selected(api)).toEqual([childrenOf(api, first)[0]])

    commands.get("selection.parent")?.run(makeContext())

    expect(selected(api)).toEqual([first])
  })

  it("cannot enter a node with no children", () => {
    const api = store()
    const first = rootChildren(api)[0] as string
    const leaf = childrenOf(api, first)[0] as string
    const commands = commandsFor(api)

    api.getState().select([leaf])

    /*
     * The middle branch of a command that will have three.
     * docs/keyboard-shortcuts.md § Selection describes ↵ as context-aware: a
     * text node enters text edit mode, a node with children selects its first
     * child, anything else does nothing. Text edit mode does not exist yet.
     */
    expect(commands.get("selection.enter")?.isAvailable(makeContext())).toBe(false)
  })

  it("cannot go above the root", () => {
    const api = store()
    const commands = commandsFor(api)

    api.getState().select([api.getState().document.root])

    expect(commands.get("selection.parent")?.isAvailable(makeContext())).toBe(false)

    commands.get("selection.parent")?.run(makeContext())

    expect(selected(api)).toEqual([api.getState().document.root])
  })
})

describe("selecting the group", () => {
  it("takes every sibling, the selected one included", () => {
    const api = store()
    const commands = commandsFor(api)

    api.getState().select([rootChildren(api)[0] as string])
    commands.get("selection.all-siblings")?.run(makeContext())

    // "All siblings" is the whole row, not the others: ⌘A on one of four
    // selects four.
    expect(selected(api)).toEqual(rootChildren(api))
  })

  it("takes only the row it was asked about", () => {
    const api = store()
    const first = rootChildren(api)[0] as string
    const commands = commandsFor(api)

    api.getState().select([childrenOf(api, first)[0] as string])
    commands.get("selection.all-siblings")?.run(makeContext())

    expect(selected(api)).toEqual(childrenOf(api, first))
  })
})

describe("clearing", () => {
  it("empties the selection, and is unavailable once empty", () => {
    const api = store()
    const commands = commandsFor(api)

    api.getState().select([rootChildren(api)[0] as string])

    expect(commands.get("selection.clear")?.isAvailable(makeContext())).toBe(true)

    commands.get("selection.clear")?.run(makeContext())

    expect(selected(api)).toEqual([])
    // Which is what lets Escape fall through to the browser, and Tab leave the
    // canvas, once there is nothing selected.
    expect(commands.get("selection.clear")?.isAvailable(makeContext())).toBe(false)
  })
})

describe("in a read-only session", () => {
  it("still walks the tree, because looking is not writing", () => {
    const api = store()
    const commands = commandsFor(api)

    api.getState().select([rootChildren(api)[0] as string])
    api.getState().setCanEdit(false)

    expect(commands.get("selection.next-sibling")?.isAvailable(makeContext())).toBe(true)

    commands.get("selection.next-sibling")?.run(makeContext())

    expect(selected(api)).toEqual([rootChildren(api)[1]])
  })

  it("still walks a locked subtree, which remains selectable", () => {
    const api = store()
    const first = rootChildren(api)[0] as string
    const commands = commandsFor(api)

    api.getState().setLocked([first], true)
    api.getState().select([first])

    // docs/editor-behavior.md § Lock: a locked component "remains selectable".
    expect(commands.get("selection.enter")?.isAvailable(makeContext())).toBe(true)

    commands.get("selection.enter")?.run(makeContext())

    expect(selected(api)).toEqual([childrenOf(api, first)[0]])
  })
})

describe("every one of them", () => {
  it("changes the selection and never the document", () => {
    const api = store()

    api.getState().select([rootChildren(api)[0] as string])
    api.getState().markSaved(2)

    const before = api.getState().document
    // The fixture's own inserts are already in history, so the claim is that
    // nothing is *added* to it — not that it is empty.
    const steps = api.getState().history.past.length

    for (const command of commandsFor(api).values()) command.run(makeContext())

    /*
     * Selection is not an edit. Walking the tree must not dirty the page, must
     * not produce something to undo, and must not queue a save.
     */
    expect(api.getState().document).toBe(before)
    expect(api.getState().persistence.status).toBe("saved")
    expect(api.getState().history.past).toHaveLength(steps)
  })

  it("declares itself non-mutating, which is what drives that", () => {
    for (const command of commandsFor(store()).values()) {
      expect(command.mutates).toBe(false)
    }
  })

  it("is described before it is built", () => {
    const built = commandsFor(store())

    expect(selectionCommandDescriptors.map((descriptor) => descriptor.id).sort()).toEqual(
      [...built.keys()].sort(),
    )

    for (const descriptor of selectionCommandDescriptors) {
      expect(descriptor.category).toBe("selection")
      expect(descriptor.title).not.toBe("")
      expect(descriptor.keywords?.length ?? 0).toBeGreaterThan(0)
    }
  })
})
