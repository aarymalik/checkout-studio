import { describe, expect, it } from "vitest"
import { createDocument } from "@checkout-studio/schema"

import { createEditCommands, editCommandDescriptors } from "../../src/state/commands"
import { createEditorStore, type EditorStoreApi } from "../../src/state/store"
import { makeContext } from "../support"

/**
 * Undo, redo, and the clipboard.
 *
 * The store has had all of it since Phase 5. What is tested here is that it is
 * reachable, and that it declines in the three cases where running would be
 * wrong: no page, a read-only session, and a text field with focus.
 *
 * That last one is the subtle one. The text guard lets ⌘Z and ⌘C through to the
 * field on purpose, so a document-level undo firing there would throw away a
 * node instead of a character.
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

  // A root with one child, so there is something to select and copy.
  api.getState().insertNew("core.section", api.getState().document.root)

  return api
}

function commandsFor(api: EditorStoreApi | null) {
  return new Map(createEditCommands({ store: () => api }).map((command) => [command.id, command]))
}

function childOf(api: EditorStoreApi): string {
  const document = api.getState().document

  return document.nodes[document.root]?.children[0] as string
}

describe("with no page open", () => {
  it("reports everything unavailable and does nothing if run", () => {
    for (const command of commandsFor(null).values()) {
      expect(command.isAvailable(makeContext())).toBe(false)
      expect(() => command.run(makeContext())).not.toThrow()
    }
  })
})

describe("while a text field has focus", () => {
  it("declines, so a text undo is never a document undo", () => {
    const api = store()
    const commands = commandsFor(api)

    api.getState().select([childOf(api)])

    const typing = makeContext({ isEditingText: true })

    for (const command of commands.values()) {
      expect(command.isAvailable(typing)).toBe(false)
    }
  })

  it("declines even when run directly", () => {
    const api = store()
    const commands = commandsFor(api)
    const before = api.getState().document

    api.getState().select([childOf(api)])
    commands.get("edit.delete")?.run(makeContext({ isEditingText: true }))

    // Backspace in a rename field deletes a character, never a section.
    expect(api.getState().document).toBe(before)
  })
})

describe("while this session may not write", () => {
  it("declines, because read-only means read-only", () => {
    const api = store()

    api.getState().select([childOf(api)])
    api.getState().setCanEdit(false)

    for (const command of commandsFor(api).values()) {
      expect(command.isAvailable(makeContext())).toBe(false)
    }
  })
})

describe("history", () => {
  it("is unavailable until there is something to undo", () => {
    const api = createEditorStore({
      document: createDocument({
        projectId: "prj_test",
        pageId: "pag_test",
        themeId: "theme_default",
        random: () => 0.5,
      }),
      baseVersion: 1,
    })

    expect(commandsFor(api).get("edit.undo")?.isAvailable(makeContext())).toBe(false)
    expect(commandsFor(api).get("edit.redo")?.isAvailable(makeContext())).toBe(false)
  })

  it("undoes the last change", () => {
    const api = store()
    const withChild = api.getState().document

    commandsFor(api).get("edit.undo")?.run(makeContext())

    expect(Object.keys(api.getState().document.nodes)).toHaveLength(1)
    expect(api.getState().document).not.toBe(withChild)
  })

  it("redoes it, and only then", () => {
    const api = store()
    const commands = commandsFor(api)

    expect(commands.get("edit.redo")?.isAvailable(makeContext())).toBe(false)

    commands.get("edit.undo")?.run(makeContext())

    expect(commands.get("edit.redo")?.isAvailable(makeContext())).toBe(true)

    commands.get("edit.redo")?.run(makeContext())

    expect(Object.keys(api.getState().document.nodes)).toHaveLength(2)
  })

  it("leaves the page needing a save, so an undo is not lost on reload", () => {
    const api = store()

    api.getState().markSaved(2)
    commandsFor(api).get("edit.undo")?.run(makeContext())

    // Undo is a change like any other as far as autosave is concerned.
    expect(api.getState().persistence.status).toBe("modified")
  })
})

describe("the clipboard", () => {
  it("needs a selection to copy, and something copied to paste", () => {
    const api = store()
    const commands = commandsFor(api)

    // Inserting selects what it inserted, so the empty case has to be asked
    // for rather than assumed.
    api.getState().clearSelection()

    expect(commands.get("edit.copy")?.isAvailable(makeContext())).toBe(false)
    expect(commands.get("edit.paste")?.isAvailable(makeContext())).toBe(false)

    api.getState().select([childOf(api)])

    expect(commands.get("edit.copy")?.isAvailable(makeContext())).toBe(true)

    commands.get("edit.copy")?.run(makeContext())

    expect(commands.get("edit.paste")?.isAvailable(makeContext())).toBe(true)
  })

  it("copies and pastes a node", () => {
    const api = store()
    const commands = commandsFor(api)

    api.getState().select([childOf(api)])
    commands.get("edit.copy")?.run(makeContext())
    commands.get("edit.paste")?.run(makeContext())

    expect(Object.keys(api.getState().document.nodes)).toHaveLength(3)
  })

  it("cuts, which removes as well as copies", () => {
    const api = store()
    const commands = commandsFor(api)

    api.getState().select([childOf(api)])
    commands.get("edit.cut")?.run(makeContext())

    expect(Object.keys(api.getState().document.nodes)).toHaveLength(1)
    expect(commands.get("edit.paste")?.isAvailable(makeContext())).toBe(true)
  })

  it("needs a selection to paste styles onto, not just something copied", () => {
    const api = store()
    const commands = commandsFor(api)

    api.getState().select([childOf(api)])
    commands.get("edit.copy")?.run(makeContext())
    api.getState().clearSelection()

    // Styles go somewhere. Without a target there is nothing to paste onto.
    expect(commands.get("edit.paste-styles")?.isAvailable(makeContext())).toBe(false)
  })

  it("pastes in place, which puts the copy where the original was", () => {
    const api = store()
    const commands = commandsFor(api)

    api.getState().select([childOf(api)])
    commands.get("edit.copy")?.run(makeContext())
    commands.get("edit.paste-in-place")?.run(makeContext())

    expect(Object.keys(api.getState().document.nodes)).toHaveLength(3)
  })

  it("pastes styles onto the selection without adding a node", () => {
    const api = store()
    const commands = commandsFor(api)
    const source = childOf(api)

    api.getState().setStyles([source], { width: 240 })
    api.getState().select([source])
    commands.get("edit.copy")?.run(makeContext())

    const second = api.getState().insertNew("core.section", api.getState().document.root)

    expect(second.ok).toBe(true)

    const before = Object.keys(api.getState().document.nodes).length

    commands.get("edit.paste-styles")?.run(makeContext())

    // Appearance only: the count must not move, or "paste styles" is just
    // "paste".
    expect(Object.keys(api.getState().document.nodes)).toHaveLength(before)
  })

  it("duplicates and deletes the selection", () => {
    const api = store()
    const commands = commandsFor(api)

    api.getState().select([childOf(api)])
    commands.get("edit.duplicate")?.run(makeContext())

    expect(Object.keys(api.getState().document.nodes)).toHaveLength(3)

    commands.get("edit.delete")?.run(makeContext())

    expect(Object.keys(api.getState().document.nodes)).toHaveLength(2)
  })
})

describe("every one of them", () => {
  it("declares that it changes the document", () => {
    for (const command of commandsFor(store()).values()) {
      // Which is what tells history grouping and the dirty flag to care.
      expect(command.mutates).toBe(true)
    }
  })

  it("is described before it is built", () => {
    const built = commandsFor(store())

    expect(editCommandDescriptors.map((descriptor) => descriptor.id).sort()).toEqual(
      [...built.keys()].sort(),
    )

    for (const descriptor of editCommandDescriptors) {
      expect(descriptor.category).toBe("edit")
      expect(descriptor.keywords?.length ?? 0).toBeGreaterThan(0)
    }
  })
})
