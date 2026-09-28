import { beforeEach, describe, expect, it } from "vitest"

import { CommandRegistry } from "../../src/commands/registry"
import { KeymapRegistry } from "../../src/keyboard/registry"
import { ShortcutConflictError } from "../../src/keyboard/conflicts"
import { makeCommand, makeContext } from "../support"

describe("KeymapRegistry", () => {
  let commands: CommandRegistry
  let keymap: KeymapRegistry

  beforeEach(() => {
    commands = new CommandRegistry()
    keymap = new KeymapRegistry(commands)
  })

  describe("resolve", () => {
    it("matches a binding in an active scope", () => {
      commands.register(makeCommand({ id: "edit.duplicate" }))
      keymap.register({
        commandId: "edit.duplicate",
        binding: { key: "KeyD", mod: true },
        scope: "canvas",
      })

      const resolution = keymap.resolve({ key: "KeyD", mod: true }, ["canvas"], makeContext())

      expect("match" in resolution && resolution.match.command.id).toBe("edit.duplicate")
    })

    it("reports an unbound key as unbound, so the browser keeps it", () => {
      const resolution = keymap.resolve({ key: "KeyD", mod: true }, ["canvas"], makeContext())

      expect(resolution).toEqual({ miss: "unbound" })
    })

    it("does not match a binding from a scope that is not active", () => {
      commands.register(makeCommand({ id: "layers.search" }))
      keymap.register({
        commandId: "layers.search",
        binding: { key: "KeyF", mod: true },
        scope: "layers",
      })

      expect(keymap.resolve({ key: "KeyF", mod: true }, ["canvas"], makeContext())).toEqual({
        miss: "unbound",
      })
    })

    // Specificity: canvas.selection beats canvas beats global.
    it("prefers the most specific scope", () => {
      commands.registerAll([makeCommand({ id: "broad" }), makeCommand({ id: "specific" })])
      keymap.registerAll([
        { commandId: "broad", binding: { key: "Enter" }, scope: "canvas" },
        { commandId: "specific", binding: { key: "Enter" }, scope: "canvas.selection" },
      ])

      const resolution = keymap.resolve(
        { key: "Enter" },
        ["canvas", "canvas.selection"],
        makeContext(),
      )

      expect("match" in resolution && resolution.match.command.id).toBe("specific")
    })

    it.each([
      ["declared after the default", 1],
      ["declared before the default", 0],
    ])("prefers higher priority within a scope, %s", (_name, insertAt) => {
      commands.registerAll([makeCommand({ id: "core" }), makeCommand({ id: "override" })])
      const declarations = [
        { commandId: "core", binding: { key: "KeyG", mod: true }, scope: "canvas" as const },
        {
          commandId: "override",
          binding: { key: "KeyG", mod: true },
          scope: "canvas" as const,
          priority: 5,
        },
      ]
      keymap.registerAll(insertAt === 0 ? [...declarations].reverse() : declarations)

      const resolution = keymap.resolve({ key: "KeyG", mod: true }, ["canvas"], makeContext())

      expect("match" in resolution && resolution.match.command.id).toBe("override")
    })

    // This is what lets ⌘D duplicate a selected node and still bookmark the page
    // when nothing is selected.
    it("reports a bound-but-unavailable key as unavailable", () => {
      commands.register(
        makeCommand({
          id: "edit.duplicate",
          isAvailable: (context) => context.selectionCount > 0,
        }),
      )
      keymap.register({
        commandId: "edit.duplicate",
        binding: { key: "KeyD", mod: true },
        scope: "canvas",
      })

      expect(keymap.resolve({ key: "KeyD", mod: true }, ["canvas"], makeContext())).toEqual({
        miss: "unavailable",
      })
    })

    it("falls through to a shallower scope when the specific command cannot run", () => {
      commands.registerAll([
        makeCommand({ id: "specific", isAvailable: () => false }),
        makeCommand({ id: "broad" }),
      ])
      keymap.registerAll([
        { commandId: "specific", binding: { key: "Escape" }, scope: "canvas.selection" },
        { commandId: "broad", binding: { key: "Escape" }, scope: "global" },
      ])

      const resolution = keymap.resolve(
        { key: "Escape" },
        ["global", "canvas.selection"],
        makeContext(),
      )

      expect("match" in resolution && resolution.match.command.id).toBe("broad")
    })

    it("skips a binding whose command has gone, without throwing", () => {
      keymap.register({ commandId: "vanished", binding: { key: "KeyV" }, scope: "canvas" })

      expect(keymap.resolve({ key: "KeyV" }, ["canvas"], makeContext())).toEqual({
        miss: "unavailable",
      })
    })

    // A chord is reached through its leader, never by its second stroke alone.
    it("never matches a chord as a single stroke", () => {
      commands.register(makeCommand({ id: "publish.publish" }))
      keymap.register({
        commandId: "publish.publish",
        binding: { key: "KeyK", alt: true, chord: [{ key: "KeyP" }] },
        scope: "studio",
      })

      expect(keymap.resolve({ key: "KeyK", alt: true }, ["studio"], makeContext())).toEqual({
        miss: "unbound",
      })
    })

    it("sees a binding registered after the last resolution", () => {
      commands.register(makeCommand({ id: "late" }))
      keymap.resolve({ key: "KeyQ", alt: true }, ["canvas"], makeContext())

      keymap.register({ commandId: "late", binding: { key: "KeyQ", alt: true }, scope: "canvas" })

      const resolution = keymap.resolve({ key: "KeyQ", alt: true }, ["canvas"], makeContext())

      expect("match" in resolution).toBe(true)
    })
  })

  describe("chordContinuations", () => {
    beforeEach(() => {
      commands.registerAll([
        makeCommand({ id: "publish.publish" }),
        makeCommand({ id: "file.snapshot", isAvailable: () => false }),
      ])
      keymap.registerAll([
        {
          commandId: "publish.publish",
          binding: { key: "KeyK", alt: true, chord: [{ key: "KeyP" }] },
          scope: "studio",
        },
        {
          commandId: "file.snapshot",
          binding: { key: "KeyK", alt: true, chord: [{ key: "KeyS" }] },
          scope: "studio",
        },
      ])
    })

    it("lists what the leader could still become", () => {
      const continuations = keymap.chordContinuations(
        { key: "KeyK", alt: true },
        ["studio"],
        makeContext(),
      )

      expect(continuations).toEqual([
        { sequence: "alt+KeyK KeyP", stroke: { key: "KeyP" }, commandId: "publish.publish" },
      ])
    })

    it("returns nothing for a stroke that is not a leader", () => {
      expect(
        keymap.chordContinuations({ key: "KeyD", mod: true }, ["studio"], makeContext()),
      ).toEqual([])
    })

    it("returns nothing when the leader's scope is not active", () => {
      expect(
        keymap.chordContinuations({ key: "KeyK", alt: true }, ["dashboard"], makeContext()),
      ).toEqual([])
    })

    it("lists a sequence once even when it is registered twice", () => {
      keymap.register({
        commandId: "publish.publish",
        binding: { key: "KeyK", alt: true, chord: [{ key: "KeyP" }] },
        scope: "studio",
      })

      expect(
        keymap.chordContinuations({ key: "KeyK", alt: true }, ["studio"], makeContext()),
      ).toHaveLength(1)
    })

    it("skips a continuation whose command has gone", () => {
      keymap.register({
        commandId: "vanished",
        binding: { key: "KeyK", alt: true, chord: [{ key: "KeyV" }] },
        scope: "studio",
      })

      const sequences = keymap
        .chordContinuations({ key: "KeyK", alt: true }, ["studio"], makeContext())
        .map((continuation) => continuation.commandId)

      expect(sequences).not.toContain("vanished")
    })

    // A single-stroke binding on the leader key is not a chord, and offers
    // nothing to continue.
    it("ignores a single-stroke binding on the same key", () => {
      const single = new KeymapRegistry(commands)
      single.register({
        commandId: "publish.publish",
        binding: { key: "KeyK", alt: true },
        scope: "studio",
      })

      expect(
        single.chordContinuations({ key: "KeyK", alt: true }, ["studio"], makeContext()),
      ).toEqual([])
    })
  })

  describe("bindingFor", () => {
    it("returns null when a command has no binding", () => {
      expect(keymap.bindingFor("edit.duplicate")).toBeNull()
    })

    it("returns the only binding when there is one", () => {
      keymap.register({
        commandId: "edit.duplicate",
        binding: { key: "KeyD", mod: true },
        scope: "canvas",
      })

      expect(keymap.bindingFor("edit.duplicate")).toEqual({ key: "KeyD", mod: true })
    })

    // The label a person expects is the one they hold when they think of the
    // command, which is the most specific binding.
    it("prefers the most specific scope whichever order they were declared in", () => {
      keymap.registerAll([
        { commandId: "edit.delete", binding: { key: "Delete" }, scope: "canvas" },
        { commandId: "edit.delete", binding: { key: "Backspace" }, scope: "canvas.selection" },
        { commandId: "edit.cut", binding: { key: "Backspace" }, scope: "canvas.selection" },
        { commandId: "edit.cut", binding: { key: "Delete" }, scope: "canvas" },
      ])

      expect(keymap.bindingFor("edit.delete")).toEqual({ key: "Backspace" })
      expect(keymap.bindingFor("edit.cut")).toEqual({ key: "Backspace" })
    })

    it("prefers priority over specificity whichever order they were declared in", () => {
      keymap.registerAll([
        { commandId: "edit.copy", binding: { key: "Delete" }, scope: "canvas", priority: 3 },
        { commandId: "edit.copy", binding: { key: "Backspace" }, scope: "canvas.selection" },
      ])

      expect(keymap.bindingFor("edit.copy")).toEqual({ key: "Delete" })
    })

    it("prefers priority over specificity", () => {
      keymap.registerAll([
        { commandId: "edit.delete", binding: { key: "Backspace" }, scope: "canvas.selection" },
        { commandId: "edit.delete", binding: { key: "Delete" }, scope: "canvas", priority: 3 },
      ])

      expect(keymap.bindingFor("edit.delete")).toEqual({ key: "Delete" })
    })
  })

  describe("format", () => {
    it("writes a binding the way a person reads it", () => {
      expect(keymap.format({ key: "KeyD", mod: true }, "mac")).toBe("⌘D")
      expect(keymap.format({ key: "KeyD", mod: true }, "other")).toBe("Ctrl+D")
    })
  })

  describe("removal", () => {
    it("disposes a single registration", () => {
      commands.register(makeCommand({ id: "edit.copy" }))
      const disposable = keymap.register({
        commandId: "edit.copy",
        binding: { key: "KeyC", mod: true },
        scope: "canvas",
      })

      disposable.dispose()

      expect(keymap.all()).toEqual([])
      expect(keymap.resolve({ key: "KeyC", mod: true }, ["canvas"], makeContext())).toEqual({
        miss: "unbound",
      })
    })

    it("tolerates being disposed twice", () => {
      const disposable = keymap.register({
        commandId: "edit.copy",
        binding: { key: "KeyC", mod: true },
        scope: "canvas",
      })

      disposable.dispose()
      disposable.dispose()

      expect(keymap.all()).toEqual([])
    })

    it("disposes a set together", () => {
      const disposable = keymap.registerAll([
        { commandId: "a.one", binding: { key: "KeyJ" }, scope: "canvas" },
        { commandId: "a.two", binding: { key: "KeyL" }, scope: "canvas" },
      ])

      disposable.dispose()

      expect(keymap.all()).toEqual([])
    })

    it("unregisters a command's bindings in one scope only", () => {
      keymap.registerAll([
        { commandId: "edit.delete", binding: { key: "Backspace" }, scope: "canvas" },
        { commandId: "edit.delete", binding: { key: "Delete" }, scope: "canvas" },
        { commandId: "edit.delete", binding: { key: "Backspace" }, scope: "layers" },
      ])

      expect(keymap.unregister("edit.delete", "canvas")).toBe(2)
      expect(keymap.all()).toHaveLength(1)
      expect(keymap.unregister("edit.delete", "canvas")).toBe(0)
    })

    it("removes everything a plugin registered", () => {
      keymap.registerAll([
        { commandId: "core.save", binding: { key: "KeyS", mod: true }, scope: "studio" },
        {
          commandId: "checkout.insert",
          binding: { key: "KeyP" },
          scope: "canvas",
          pluginId: "checkout",
        },
      ])

      expect(keymap.removePlugin("checkout")).toBe(1)
      expect(keymap.removePlugin("checkout")).toBe(0)
      expect(keymap.all()).toHaveLength(1)
    })
  })

  describe("assertNoConflicts", () => {
    it("passes a clean keymap and returns no warnings", () => {
      commands.register(makeCommand({ id: "edit.duplicate" }))
      keymap.register({
        commandId: "edit.duplicate",
        binding: { key: "KeyD", mod: true },
        scope: "canvas",
      })

      expect(keymap.assertNoConflicts()).toEqual([])
    })

    // Failing at startup rather than on the keystroke: a silently shadowed
    // shortcut is close to undiagnosable later.
    it("throws on a duplicate binding in one scope", () => {
      commands.registerAll([makeCommand({ id: "a.one" }), makeCommand({ id: "a.two" })])
      keymap.registerAll([
        { commandId: "a.one", binding: { key: "KeyJ", alt: true }, scope: "canvas" },
        { commandId: "a.two", binding: { key: "KeyJ", alt: true }, scope: "canvas" },
      ])

      expect(() => keymap.assertNoConflicts()).toThrow(ShortcutConflictError)
    })

    it("throws on a binding to a command that does not exist", () => {
      keymap.register({ commandId: "ghost", binding: { key: "KeyJ", alt: true }, scope: "canvas" })

      expect(() => keymap.assertNoConflicts()).toThrow(ShortcutConflictError)
    })

    it("returns warnings rather than throwing, since they have a defined winner", () => {
      commands.registerAll([makeCommand({ id: "a.one" }), makeCommand({ id: "a.two" })])
      keymap.registerAll([
        { commandId: "a.one", binding: { key: "KeyJ", alt: true }, scope: "canvas" },
        { commandId: "a.two", binding: { key: "KeyJ", alt: true }, scope: "canvas", priority: 1 },
      ])

      const warnings = keymap.assertNoConflicts()

      expect(warnings).toHaveLength(1)
      expect(warnings[0]?.severity).toBe("warning")
    })
  })

  describe("conflicts", () => {
    it("checks command existence against its own command registry", () => {
      keymap.register({ commandId: "ghost", binding: { key: "KeyJ" }, scope: "canvas" })

      expect(keymap.conflicts()).toHaveLength(1)

      commands.register(makeCommand({ id: "ghost" }))

      expect(keymap.conflicts()).toEqual([])
    })
  })

  describe("all", () => {
    it("hands out a copy, so a caller cannot mutate the keymap", () => {
      keymap.register({ commandId: "a.one", binding: { key: "KeyJ" }, scope: "canvas" })

      const snapshot = keymap.all() as ReturnType<KeymapRegistry["all"]>[number][]
      snapshot.pop()

      expect(keymap.all()).toHaveLength(1)
    })
  })
})
