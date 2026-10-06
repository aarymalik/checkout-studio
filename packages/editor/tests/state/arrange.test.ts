import { describe, expect, it } from "vitest"
import { createDocument } from "@checkout-studio/schema"

import { arrangeCommandDescriptors, createArrangeCommands } from "../../src/state/arrange"
import { createEditorStore, type EditorStoreApi } from "../../src/state/store"
import { makeContext } from "../support"

/**
 * Locking, hiding, and moving a node through the tree.
 *
 * The store has had all of it for phases. What is tested here is that it is
 * reachable, that the lock actually forbids what docs/editor-behavior.md § Lock
 * says it forbids, and that the four declining cases decline: no page, a
 * read-only session, a text field with focus, and nowhere to move to.
 */

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

  // A root with two sections, so there is somewhere to move to.
  api.getState().insertNew("core.section", api.getState().document.root)
  api.getState().insertNew("core.section", api.getState().document.root)

  return api
}

function commandsFor(api: EditorStoreApi | null) {
  return new Map(
    createArrangeCommands({ store: () => api }).map((command) => [command.id, command]),
  )
}

function childrenOf(api: EditorStoreApi): readonly string[] {
  const document = api.getState().document

  return document.nodes[document.root]?.children ?? []
}

describe("with no page open", () => {
  it("reports everything unavailable and does nothing if run", () => {
    for (const command of commandsFor(null).values()) {
      expect(command.isAvailable(makeContext())).toBe(false)
      expect(command.isActive?.(makeContext())).toBe(false)
      expect(() => command.run(makeContext())).not.toThrow()
    }
  })
})

describe("while a text field has focus", () => {
  it("declines, so ⌘L in a rename field is not a lock", () => {
    const api = store()

    api.getState().select([childrenOf(api)[0] as string])

    for (const command of commandsFor(api).values()) {
      expect(command.isAvailable(makeContext({ isEditingText: true }))).toBe(false)
    }
  })
})

describe("while this session may not write", () => {
  it("declines, because read-only means read-only", () => {
    const api = store()

    api.getState().select([childrenOf(api)[0] as string])
    api.getState().setCanEdit(false)

    for (const command of commandsFor(api).values()) {
      expect(command.isAvailable(makeContext())).toBe(false)
    }
  })
})

describe("locking", () => {
  it("needs a selection, and reports what it wrote", () => {
    const api = store()
    const commands = commandsFor(api)
    const first = childrenOf(api)[0] as string

    api.getState().clearSelection()
    expect(commands.get("arrange.lock")?.isAvailable(makeContext())).toBe(false)

    api.getState().select([first])
    expect(commands.get("arrange.lock")?.isActive?.(makeContext())).toBe(false)

    commands.get("arrange.lock")?.run(makeContext())

    expect(api.getState().document.nodes[first]?.metadata.locked).toBe(true)
    expect(commands.get("arrange.lock")?.isActive?.(makeContext())).toBe(true)
  })

  it("stays available while locked, because unlocking is the other half", () => {
    const api = store()
    const commands = commandsFor(api)
    const first = childrenOf(api)[0] as string

    api.getState().select([first])
    commands.get("arrange.lock")?.run(makeContext())

    expect(commands.get("arrange.lock")?.isAvailable(makeContext())).toBe(true)

    commands.get("arrange.lock")?.run(makeContext())

    expect(api.getState().document.nodes[first]?.metadata.locked).toBe(false)
  })

  it("locks a mixed selection rather than splitting it", () => {
    const api = store()
    const commands = commandsFor(api)
    const [first, second] = childrenOf(api) as [string, string]

    api.getState().setLocked([first], true)
    api.getState().select([first, second])

    // One already locked, one not: a press means "lock everything", and only a
    // second press releases them. A mixed selection needs a defined direction.
    expect(commands.get("arrange.lock")?.isActive?.(makeContext())).toBe(false)

    commands.get("arrange.lock")?.run(makeContext())

    expect(api.getState().document.nodes[first]?.metadata.locked).toBe(true)
    expect(api.getState().document.nodes[second]?.metadata.locked).toBe(true)
  })
})

describe("hiding", () => {
  it("toggles visibility and reports it", () => {
    const api = store()
    const commands = commandsFor(api)
    const first = childrenOf(api)[0] as string

    api.getState().select([first])
    commands.get("arrange.hide")?.run(makeContext())

    expect(api.getState().document.nodes[first]?.visibility.hidden).toBe(true)
    expect(commands.get("arrange.hide")?.isActive?.(makeContext())).toBe(true)

    commands.get("arrange.hide")?.run(makeContext())

    expect(api.getState().document.nodes[first]?.visibility.hidden).toBe(false)
  })

  it("does not lock what it hides", () => {
    const api = store()
    const commands = commandsFor(api)
    const first = childrenOf(api)[0] as string

    api.getState().select([first])
    commands.get("arrange.hide")?.run(makeContext())

    // Hidden components "remain in Layers" and stay editable — hiding is not a
    // weaker form of locking.
    expect(api.getState().document.nodes[first]?.metadata.locked).toBe(false)
    expect(commands.get("arrange.move-down")?.isAvailable(makeContext())).toBe(true)
  })
})

describe("moving", () => {
  it("reorders among siblings", () => {
    const api = store()
    const [first, second] = childrenOf(api) as [string, string]

    api.getState().select([first])
    commandsFor(api).get("arrange.move-down")?.run(makeContext())

    expect(childrenOf(api)).toEqual([second, first])
  })

  it("has nowhere to go at the ends", () => {
    const api = store()
    const commands = commandsFor(api)

    api.getState().select([childrenOf(api)[0] as string])

    // The first child of the root has no earlier position and no grandparent
    // to rise into.
    expect(commands.get("arrange.move-up")?.isAvailable(makeContext())).toBe(false)
    expect(commands.get("arrange.move-down")?.isAvailable(makeContext())).toBe(true)
  })

  it("moves one node, not several", () => {
    const api = store()
    const commands = commandsFor(api)

    api.getState().select(childrenOf(api))

    /*
     * There is no rule written down for what moving five nodes at once should
     * do to their relative order, and `reorder` moves one. Declining is honest;
     * inventing an ordering here would be inventing it in the wrong place.
     */
    expect(commands.get("arrange.move-down")?.isAvailable(makeContext())).toBe(false)
  })

  it("refuses to move a locked node", () => {
    const api = store()
    const commands = commandsFor(api)
    const first = childrenOf(api)[0] as string
    const before = childrenOf(api)

    api.getState().setLocked([first], true)
    api.getState().select([first])

    // docs/editor-behavior.md § Lock: "Cannot move."
    expect(commands.get("arrange.move-down")?.isAvailable(makeContext())).toBe(false)

    commands.get("arrange.move-down")?.run(makeContext())

    expect(childrenOf(api)).toEqual(before)
  })

  it("refuses to move a node inside a locked container", () => {
    const api = store()
    const commands = commandsFor(api)
    const parent = childrenOf(api)[0] as string
    const inserted = api.getState().insertNew("core.section", parent)

    expect(inserted.ok).toBe(true)

    api.getState().setLocked([parent], true)
    api.getState().select([api.getState().document.nodes[parent]?.children[0] as string])

    // `isLocked` is self-or-ancestor, so a locked container protects what is
    // inside it as well as its own order.
    expect(commands.get("arrange.move-up")?.isAvailable(makeContext())).toBe(false)
    expect(commands.get("arrange.move-out")?.isAvailable(makeContext())).toBe(false)
  })

  it("refuses to move a node into a locked container", () => {
    const api = store()
    const commands = commandsFor(api)
    const [first, second] = childrenOf(api) as [string, string]

    // A container with a child, so stepping up from `second` steps into it.
    const inserted = api.getState().insertNew("core.section", first)

    expect(inserted.ok).toBe(true)

    api.getState().setLocked([first], true)
    api.getState().select([second])

    // Dropping a node into a locked container changes that container's
    // children, which is a change to the thing that was locked.
    expect(commands.get("arrange.move-up")?.isAvailable(makeContext())).toBe(false)
  })

  it("moves into the container above, and back out of it", () => {
    const api = store()
    const commands = commandsFor(api)
    const [first, second] = childrenOf(api) as [string, string]

    api.getState().select([second])
    commands.get("arrange.move-into")?.run(makeContext())

    expect(api.getState().document.nodes[second]?.parentId).toBe(first)

    commands.get("arrange.move-out")?.run(makeContext())

    expect(api.getState().document.nodes[second]?.parentId).toBe(api.getState().document.root)
  })
})

describe("every one of them", () => {
  it("declares that it changes the document", () => {
    for (const command of commandsFor(store()).values()) {
      expect(command.mutates).toBe(true)
    }
  })

  it("is described before it is built", () => {
    const built = commandsFor(store())

    expect(arrangeCommandDescriptors.map((descriptor) => descriptor.id).sort()).toEqual(
      [...built.keys()].sort(),
    )

    for (const descriptor of arrangeCommandDescriptors) {
      expect(descriptor.category).toBe("arrange")
      expect(descriptor.title).not.toBe("")
      expect(descriptor.keywords?.length ?? 0).toBeGreaterThan(0)
    }
  })
})
