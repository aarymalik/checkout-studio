import { beforeEach, describe, expect, it, vi } from "vitest"

import { CommandRegistry, CommandRegistryError } from "../../src/commands/registry"
import { makeCommand, makeContext } from "../support"

describe("CommandRegistry", () => {
  let registry: CommandRegistry

  beforeEach(() => {
    registry = new CommandRegistry()
  })

  it("registers and retrieves a command", () => {
    registry.register(makeCommand({ id: "edit.duplicate", title: "Duplicate" }))

    expect(registry.get("edit.duplicate")?.title).toBe("Duplicate")
    expect(registry.has("edit.duplicate")).toBe(true)
    expect(registry.all()).toHaveLength(1)
  })

  it("returns null for a command that was never registered", () => {
    expect(registry.get("nothing.here")).toBeNull()
    expect(registry.has("nothing.here")).toBe(false)
  })

  it("rejects a duplicate id", () => {
    registry.register(makeCommand({ id: "edit.copy" }))

    expect(() => registry.register(makeCommand({ id: "edit.copy" }))).toThrow(CommandRegistryError)
  })

  it("unregisters through the returned disposable", () => {
    const disposable = registry.register(makeCommand({ id: "edit.paste" }))

    disposable.dispose()

    expect(registry.has("edit.paste")).toBe(false)
  })

  it("unregisters by id, and reports whether anything went", () => {
    registry.register(makeCommand({ id: "view.zoom-in" }))

    expect(registry.unregister("view.zoom-in")).toBe(true)
    expect(registry.unregister("view.zoom-in")).toBe(false)
  })

  describe("registerAll", () => {
    it("registers a set, disposed together", () => {
      const disposable = registry.registerAll([
        makeCommand({ id: "a.one" }),
        makeCommand({ id: "a.two" }),
      ])

      expect(registry.all()).toHaveLength(2)

      disposable.dispose()

      expect(registry.all()).toHaveLength(0)
    })

    // A plugin that half-registers is worse than one that fails: half its
    // shortcuts work, and nothing says which half.
    it("rolls back entirely when one of the set is a duplicate", () => {
      registry.register(makeCommand({ id: "b.two" }))

      expect(() =>
        registry.registerAll([makeCommand({ id: "b.one" }), makeCommand({ id: "b.two" })]),
      ).toThrow(CommandRegistryError)

      expect(registry.has("b.one")).toBe(false)
      expect(registry.all()).toHaveLength(1)
    })
  })

  describe("availability", () => {
    it("lists only the commands that can run in this context", () => {
      registry.registerAll([
        makeCommand({ id: "always" }),
        makeCommand({
          id: "needs-selection",
          isAvailable: (context) => context.selectionCount > 0,
        }),
      ])

      const withNothingSelected = registry.available(makeContext())
      const withSomethingSelected = registry.available(makeContext({ selectionCount: 1 }))

      expect(withNothingSelected.map((command) => command.id)).toEqual(["always"])
      expect(withSomethingSelected.map((command) => command.id)).toEqual([
        "always",
        "needs-selection",
      ])
    })
  })

  describe("removePlugin", () => {
    it("removes everything a plugin contributed and leaves the rest", () => {
      registry.registerAll([
        makeCommand({ id: "core.save" }),
        makeCommand({ id: "checkout.one", pluginId: "checkout" }),
        makeCommand({ id: "checkout.two", pluginId: "checkout" }),
      ])

      expect(registry.removePlugin("checkout")).toBe(2)
      expect(registry.all().map((command) => command.id)).toEqual(["core.save"])
    })
  })

  it("runs a command with the context it was given", () => {
    const run = vi.fn()
    registry.register(makeCommand({ id: "file.save", run }))
    const context = makeContext({ isDirty: true })

    void registry.get("file.save")?.run(context)

    expect(run).toHaveBeenCalledWith(context)
  })
})
