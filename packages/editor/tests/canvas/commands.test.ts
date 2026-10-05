import { describe, expect, it } from "vitest"
import { createDocument } from "@checkout-studio/schema"

import { createViewportCommands, viewportCommandDescriptors } from "../../src/canvas/commands"
import { ZOOM_STEPS } from "../../src/canvas/viewport"
import { createEditorStore, type EditorStoreApi } from "../../src/state/store"
import { makeContext } from "../support"

/**
 * The viewport's commands.
 *
 * They are built once for the application, before any page is open and still
 * there after one closes — so the half of this that matters is what they do
 * with no store: report themselves unavailable, and do nothing if run anyway.
 * A command that throws when somebody presses its key is worse than one that
 * declines.
 */

function store(): EditorStoreApi {
  return createEditorStore({
    document: createDocument({
      projectId: "prj_test",
      pageId: "pag_test",
      themeId: "theme_default",
      random: () => 0.5,
    }),
    baseVersion: 1,
  })
}

function commandsFor(api: EditorStoreApi | null) {
  const built = createViewportCommands({ store: () => api })

  return new Map(built.map((command) => [command.id, command]))
}

describe("with no page open", () => {
  it("reports every command unavailable", () => {
    for (const command of commandsFor(null).values()) {
      expect(command.isAvailable(makeContext())).toBe(false)
    }
  })

  it("does nothing rather than throwing when one is run anyway", () => {
    // A shortcut can fire between a page closing and the registry noticing.
    for (const command of commandsFor(null).values()) {
      expect(() => command.run(makeContext())).not.toThrow()
    }
  })

  it("reports no device as active", () => {
    for (const command of commandsFor(null).values()) {
      expect(command.isActive?.(makeContext())).toBe(false)
    }
  })
})

describe("zoom", () => {
  it("steps up through the scale rather than multiplying", () => {
    const api = store()

    api.getState().setZoom(1)
    commandsFor(api).get("view.zoom-in")?.run(makeContext())

    // The next step on the scale, so repeated presses land on the same values
    // the toolbar shows rather than on 110%, 121%, 133%.
    expect(api.getState().viewport.zoom).toBe(ZOOM_STEPS[ZOOM_STEPS.indexOf(1) + 1])
  })

  it("steps down through the scale", () => {
    const api = store()

    api.getState().setZoom(1)
    commandsFor(api).get("view.zoom-out")?.run(makeContext())

    expect(api.getState().viewport.zoom).toBe(ZOOM_STEPS[ZOOM_STEPS.indexOf(1) - 1])
  })

  it("stops at the ends of the scale instead of going past them", () => {
    const api = store()
    const commands = commandsFor(api)

    api.getState().setZoom(ZOOM_STEPS[ZOOM_STEPS.length - 1] as number)
    commands.get("view.zoom-in")?.run(makeContext())

    expect(api.getState().viewport.zoom).toBe(ZOOM_STEPS[ZOOM_STEPS.length - 1])

    api.getState().setZoom(ZOOM_STEPS[0] as number)
    commands.get("view.zoom-out")?.run(makeContext())

    expect(api.getState().viewport.zoom).toBe(ZOOM_STEPS[0])
  })

  it("returns to actual size from anywhere", () => {
    const api = store()

    api.getState().setZoom(3)
    commandsFor(api).get("view.zoom-reset")?.run(makeContext())

    expect(api.getState().viewport.zoom).toBe(1)
  })

  it("leaves the pan alone", () => {
    const api = store()

    api.getState().setPan({ x: 120, y: -40 })
    commandsFor(api).get("view.zoom-in")?.run(makeContext())

    /*
     * Zooming about the canvas origin, not the viewport centre.
     *
     * Anchoring on the centre needs the size of the surface, which only a
     * mounted canvas knows. This is the honest version until that exists, and
     * the test says so rather than leaving the next reader to wonder.
     */
    expect(api.getState().viewport.pan).toEqual({ x: 120, y: -40 })
  })
})

describe("devices", () => {
  it("switches which breakpoint is being edited", () => {
    const api = store()
    const commands = commandsFor(api)

    commands.get("view.device.mobile")?.run(makeContext())
    expect(api.getState().viewport.breakpoint).toBe("mobile")

    commands.get("view.device.tablet")?.run(makeContext())
    expect(api.getState().viewport.breakpoint).toBe("tablet")

    commands.get("view.device.desktop")?.run(makeContext())
    expect(api.getState().viewport.breakpoint).toBe("desktop")
  })

  it("marks the current device active, and only that one", () => {
    const api = store()
    const commands = commandsFor(api)

    commands.get("view.device.tablet")?.run(makeContext())

    expect(commands.get("view.device.tablet")?.isActive?.(makeContext())).toBe(true)
    expect(commands.get("view.device.desktop")?.isActive?.(makeContext())).toBe(false)
    expect(commands.get("view.device.mobile")?.isActive?.(makeContext())).toBe(false)
  })

  it("does not mark a zoom command active, which is not a toggle", () => {
    const api = store()
    const commands = commandsFor(api)

    for (const id of ["view.zoom-in", "view.zoom-out", "view.zoom-reset"]) {
      expect(commands.get(id)?.isActive?.(makeContext())).toBe(false)
    }
  })

  it("leaves the zoom where it was", () => {
    const api = store()

    api.getState().setZoom(2)
    commandsFor(api).get("view.device.mobile")?.run(makeContext())

    // Switching device keeps the zoom, per docs/phases.md Phase 7: "Zoom and
    // pan state survive a device switch".
    expect(api.getState().viewport.zoom).toBe(2)
  })
})

describe("every one of them", () => {
  it("changes the viewport and never the document", () => {
    const api = store()
    const before = api.getState().document

    for (const command of commandsFor(api).values()) {
      command.run(makeContext())
    }

    // The viewport is not the page. Zooming must not make a document dirty,
    // and must not produce a history entry to undo.
    expect(api.getState().document).toBe(before)
    expect(api.getState().persistence.status).toBe("saved")
    expect(api.getState().history.past).toEqual([])
  })

  it("declares itself non-mutating, which is what drives that", () => {
    for (const command of commandsFor(store()).values()) {
      expect(command.mutates).toBe(false)
    }
  })

  it("is described before it is built, so a reference screen can list it", () => {
    const built = commandsFor(store())

    expect(viewportCommandDescriptors.map((descriptor) => descriptor.id).sort()).toEqual(
      [...built.keys()].sort(),
    )

    for (const descriptor of viewportCommandDescriptors) {
      expect(descriptor.category).toBe("view")
      expect(descriptor.title).not.toBe("")
      expect(descriptor.keywords?.length ?? 0).toBeGreaterThan(0)
    }
  })
})
