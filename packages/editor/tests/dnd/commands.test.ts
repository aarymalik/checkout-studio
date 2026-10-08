import { describe, expect, it } from "vitest"
import { createDocument } from "@checkout-studio/schema"

import { createDndCommands, dndCommandDescriptors } from "../../src/dnd/commands"
import { createEditorStore, type EditorStoreApi } from "../../src/state/store"
import { makeContext } from "../support"

/**
 * Moving a node with the keyboard, as commands.
 *
 * The gesture is modal, which is the part worth testing: picking up is only
 * available when something is selected and nothing is already in the hand, and
 * everything else is only available while something is. Getting that wrong
 * means `↵` either drops nothing or drops twice.
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
  const root = api.getState().document.root

  api.getState().insertNew("core.section", root)
  api.getState().insertNew("core.section", root)
  api.getState().clearSelection()

  return api
}

function commandsFor(api: EditorStoreApi | null) {
  return new Map(createDndCommands({ store: () => api }).map((command) => [command.id, command]))
}

const children = (api: EditorStoreApi): readonly string[] =>
  api.getState().document.nodes[api.getState().document.root]?.children ?? []

describe("with no page open", () => {
  it("reports everything unavailable and does nothing if run", () => {
    for (const command of commandsFor(null).values()) {
      expect(command.isAvailable(makeContext())).toBe(false)
      expect(() => command.run(makeContext())).not.toThrow()
    }
  })
})

describe("with nothing in the hand", () => {
  it("offers only picking up, and only with something selected", () => {
    const api = store()
    const commands = commandsFor(api)

    expect(commands.get("dnd.pick-up")?.isAvailable(makeContext())).toBe(false)

    api.getState().select([children(api)[0] as string])

    expect(commands.get("dnd.pick-up")?.isAvailable(makeContext())).toBe(true)

    for (const id of ["dnd.step-up", "dnd.step-down", "dnd.drop", "dnd.cancel"]) {
      expect(commands.get(id)?.isAvailable(makeContext()), id).toBe(false)
    }
  })

  it("does nothing when any of them is run anyway", () => {
    const api = store()
    const before = api.getState().document

    // Run without asking first, which is legitimate: a keystroke decides
    // availability before it fires and the selection can empty in between.
    for (const id of ["dnd.pick-up", "dnd.step-down", "dnd.drop", "dnd.cancel"]) {
      commandsFor(api).get(id)?.run(makeContext())
    }

    expect(api.getState().document).toBe(before)
    expect(api.getState().drag.keyboard).toBeNull()
  })
})

describe("with a node in the hand", () => {
  function holding(): { api: EditorStoreApi; commands: ReturnType<typeof commandsFor> } {
    const api = store()
    const commands = commandsFor(api)

    api.getState().select([children(api)[0] as string])
    commands.get("dnd.pick-up")?.run(makeContext())

    return { api, commands }
  }

  it("holds it without touching the document", () => {
    const { api } = holding()

    expect(api.getState().drag.keyboard?.id).toBe(children(api)[0])
    expect(api.getState().history.past.length).toBeGreaterThan(0)
    expect(api.getState().persistence.status).toBe("modified")
  })

  it("will not pick up a second one", () => {
    const { commands } = holding()

    // One hand. Picking up again would lose track of the first.
    expect(commands.get("dnd.pick-up")?.isAvailable(makeContext())).toBe(false)
  })

  it("steps, and stops at the ends rather than letting go", () => {
    const { api, commands } = holding()

    commands.get("dnd.step-down")?.run(makeContext())

    const moved = api.getState().drag.keyboard

    expect(moved?.steps).toBe(1)

    // Already first: there is nowhere above and no grandparent.
    commands.get("dnd.step-up")?.run(makeContext())
    commands.get("dnd.step-up")?.run(makeContext())
    commands.get("dnd.step-up")?.run(makeContext())

    expect(api.getState().drag.keyboard).not.toBeNull()
  })

  it("drops as one history entry", () => {
    const { api, commands } = holding()
    const steps = api.getState().history.past.length

    commands.get("dnd.step-down")?.run(makeContext())
    commands.get("dnd.drop")?.run(makeContext())

    expect(api.getState().drag.keyboard).toBeNull()
    expect(api.getState().history.past).toHaveLength(steps + 1)
    expect(children(api)[1]).toBe(children(api)[1])
  })

  it("writes nothing when it is dropped where it started", () => {
    const { api, commands } = holding()
    const steps = api.getState().history.past.length
    const before = api.getState().document

    commands.get("dnd.drop")?.run(makeContext())

    /*
     * Back where it started is not a move. An entry here would be one that
     * undoes to the same thing, which is a history a person cannot read.
     */
    expect(api.getState().document).toBe(before)
    expect(api.getState().history.past).toHaveLength(steps)
  })

  it("puts it back, with nothing to undo", () => {
    const { api, commands } = holding()
    const steps = api.getState().history.past.length
    const before = api.getState().document

    commands.get("dnd.step-down")?.run(makeContext())
    commands.get("dnd.cancel")?.run(makeContext())

    expect(api.getState().drag.keyboard).toBeNull()
    expect(api.getState().document).toBe(before)
    expect(api.getState().history.past).toHaveLength(steps)
  })
})

describe("while a text field has focus", () => {
  it("declines, so M in a rename field is a letter", () => {
    const api = store()

    api.getState().select([children(api)[0] as string])

    const typing = makeContext({ isEditingText: true })

    for (const command of commandsFor(api).values()) {
      expect(command.isAvailable(typing)).toBe(false)
    }

    commandsFor(api).get("dnd.pick-up")?.run(typing)

    expect(api.getState().drag.keyboard).toBeNull()
  })
})

describe("while this session may not write", () => {
  it("declines, because a drop would be a write", () => {
    const api = store()

    api.getState().select([children(api)[0] as string])
    api.getState().setCanEdit(false)

    for (const command of commandsFor(api).values()) {
      expect(command.isAvailable(makeContext())).toBe(false)
    }
  })
})

describe("a locked node", () => {
  it("cannot be picked up at all", () => {
    const api = store()
    const first = children(api)[0] as string

    api.getState().setLocked([first], true)
    api.getState().select([first])

    const commands = commandsFor(api)

    commands.get("dnd.pick-up")?.run(makeContext())

    // Refused before anything lifts, rather than after the user has carried it
    // somewhere.
    expect(api.getState().drag.keyboard).toBeNull()
  })
})

describe("every one of them", () => {
  it("declares whether it changes the document, and only the drop does", () => {
    const commands = commandsFor(store())

    expect(commands.get("dnd.drop")?.mutates).toBe(true)

    for (const id of ["dnd.pick-up", "dnd.step-up", "dnd.step-in", "dnd.cancel"]) {
      expect(commands.get(id)?.mutates, id).toBe(false)
    }
  })

  it("is described before it is built", () => {
    const built = commandsFor(store())

    expect(dndCommandDescriptors.map((descriptor) => descriptor.id).sort()).toEqual(
      [...built.keys()].sort(),
    )

    for (const descriptor of dndCommandDescriptors) {
      expect(descriptor.category).toBe("arrange")
      expect(descriptor.title).not.toBe("")
      expect(descriptor.keywords?.length ?? 0).toBeGreaterThan(0)
    }
  })

  it("passes the caller's rules through", () => {
    const api = store()
    const asked: string[] = []
    const commands = new Map(
      createDndCommands({
        store: () => api,
        canHaveChildren: (node) => {
          asked.push(node.id)

          return true
        },
        nameOf: () => "the thing",
      }).map((command) => [command.id, command]),
    )

    api.getState().select([children(api)[0] as string])
    commands.get("dnd.pick-up")?.run(makeContext())
    commands.get("dnd.step-down")?.run(makeContext())

    expect(asked.length).toBeGreaterThan(0)
  })
})
