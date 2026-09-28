import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CommandRegistry } from "../../src/commands/registry"
import { KeymapRegistry } from "../../src/keyboard/registry"
import { KeyboardDispatcher } from "../../src/keyboard/dispatcher"
import { reservedBindings } from "../../src/keyboard/reserved"
import type { EditorContext } from "../../src/commands/types"
import type { Platform, ScopeId } from "../../src/keyboard/types"
import { keyEvent, makeCommand, makeContext } from "../support"

describe("KeyboardDispatcher", () => {
  let commands: CommandRegistry
  let keymap: KeymapRegistry
  let scopes: ScopeId[]
  let context: EditorContext
  let ran: string[]

  function dispatcher(options: { platform?: Platform; onError?: (error: unknown) => void } = {}) {
    return new KeyboardDispatcher({
      keymap,
      commands,
      platform: options.platform ?? "mac",
      getScopes: () => scopes,
      getContext: () => context,
      chordTimeoutMs: 1_000,
      ...(options.onError === undefined ? {} : { onError: options.onError }),
    })
  }

  beforeEach(() => {
    commands = new CommandRegistry()
    keymap = new KeymapRegistry(commands)
    scopes = ["global", "studio", "canvas"]
    context = makeContext({ scopes })
    ran = []

    commands.registerAll([
      makeCommand({ id: "edit.duplicate", run: () => void ran.push("edit.duplicate") }),
      makeCommand({ id: "edit.delete", run: () => void ran.push("edit.delete") }),
      makeCommand({ id: "arrange.nudge-up", run: () => void ran.push("arrange.nudge-up") }),
      makeCommand({ id: "publish.publish", run: () => void ran.push("publish.publish") }),
      makeCommand({
        id: "arrange.group",
        isAvailable: (current) => current.selectionCount > 1,
        run: () => void ran.push("arrange.group"),
      }),
    ])

    keymap.registerAll([
      { commandId: "edit.duplicate", binding: { key: "KeyD", mod: true }, scope: "canvas" },
      { commandId: "edit.delete", binding: { key: "Backspace" }, scope: "canvas" },
      { commandId: "arrange.group", binding: { key: "KeyG", mod: true }, scope: "canvas" },
      {
        commandId: "arrange.nudge-up",
        binding: { key: "ArrowUp" },
        scope: "canvas",
        allowRepeat: true,
      },
      {
        commandId: "publish.publish",
        binding: { key: "KeyK", alt: true, chord: [{ key: "KeyP" }] },
        scope: "studio",
      },
    ])
  })

  describe("running commands", () => {
    it("runs the command a keystroke resolves to", () => {
      const result = dispatcher().handle(keyEvent({ key: "KeyD", mod: true }, "mac"))

      expect(result).toEqual({ type: "ran", commandId: "edit.duplicate" })
      expect(ran).toEqual(["edit.duplicate"])
    })

    it("takes the key from the browser when it runs something", () => {
      const event = keyEvent({ key: "KeyD", mod: true }, "mac")
      dispatcher().handle(event)

      expect(event.defaultPrevented).toBe(true)
    })

    it("leaves the key to the browser when preventDefault is declined", () => {
      keymap.register({
        commandId: "edit.delete",
        binding: { key: "KeyY", alt: true },
        scope: "canvas",
        preventDefault: false,
      })
      const event = keyEvent({ key: "KeyY", alt: true }, "mac")

      dispatcher().handle(event)

      expect(event.defaultPrevented).toBe(false)
      expect(ran).toEqual(["edit.delete"])
    })

    it("resolves the primary modifier per platform", () => {
      expect(
        dispatcher({ platform: "other" }).handle(keyEvent({ key: "KeyD", mod: true }, "other")),
      ).toEqual({ type: "ran", commandId: "edit.duplicate" })
    })

    it("ignores a Mac Command press off a Mac", () => {
      const event = new KeyboardEvent("keydown", { code: "KeyD", metaKey: true, cancelable: true })

      expect(dispatcher({ platform: "other" }).handle(event)).toEqual({
        type: "ignored",
        reason: "unbound",
      })
    })
  })

  describe("keys that are not ours", () => {
    // Exit criterion: no browser or OS shortcut is shadowed outside a documented
    // exception. Nothing in the reserved table may be intercepted.
    it("hands every reserved key to the browser", () => {
      const subject = dispatcher()

      for (const binding of reservedBindings()) {
        const event = keyEvent(binding, "mac")
        const result = subject.handle(event)

        expect(result, `${binding.key} was intercepted`).toEqual({
          type: "ignored",
          reason: "unbound",
        })
        expect(event.defaultPrevented).toBe(false)
      }
    })

    it("ignores a modifier pressed on its own", () => {
      for (const code of ["ShiftLeft", "MetaLeft", "ControlRight", "AltLeft", "CapsLock"]) {
        const event = new KeyboardEvent("keydown", { code, cancelable: true })

        expect(dispatcher().handle(event)).toEqual({ type: "ignored", reason: "modifier-only" })
      }
    })

    // With nothing selected, ⌘G is still Find Next.
    it("leaves an unavailable command's key to the browser", () => {
      const event = keyEvent({ key: "KeyG", mod: true }, "mac")

      expect(dispatcher().handle(event)).toEqual({ type: "ignored", reason: "unavailable" })
      expect(event.defaultPrevented).toBe(false)
    })

    it("runs the same key once its command becomes available", () => {
      context = makeContext({ scopes, selectionCount: 2 })

      expect(dispatcher().handle(keyEvent({ key: "KeyG", mod: true }, "mac"))).toEqual({
        type: "ran",
        commandId: "arrange.group",
      })
    })
  })

  describe("the text input guard", () => {
    function field(): HTMLInputElement {
      const element = document.createElement("input")
      element.type = "text"
      document.body.append(element)

      return element
    }

    afterEach(() => {
      document.body.innerHTML = ""
    })

    // The bug the guard exists to prevent: Backspace eating a component while
    // somebody was editing a heading.
    it("never dispatches a node command from inside a field", () => {
      const event = keyEvent({ key: "Backspace" }, "mac", { target: field() })

      expect(dispatcher().handle(event)).toEqual({ type: "ignored", reason: "text-entry" })
      expect(event.defaultPrevented).toBe(false)
      expect(ran).toEqual([])
    })

    it("lets the documented handful through", () => {
      commands.register(
        makeCommand({ id: "help.palette", run: () => void ran.push("help.palette") }),
      )
      keymap.register({
        commandId: "help.palette",
        binding: { key: "KeyK", mod: true },
        scope: "global",
      })

      const event = keyEvent({ key: "KeyK", mod: true }, "mac", { target: field() })

      expect(dispatcher().handle(event)).toEqual({ type: "ran", commandId: "help.palette" })
    })

    it("leaves the macOS cursor-movement keys to the field", () => {
      commands.register(
        makeCommand({ id: "edit.select-all", run: () => void ran.push("select-all") }),
      )
      keymap.register({
        commandId: "edit.select-all",
        binding: { key: "KeyA", ctrl: true },
        scope: "global",
      })

      const event = keyEvent({ key: "KeyA", ctrl: true }, "mac", { target: field() })

      expect(dispatcher().handle(event)).toEqual({ type: "ignored", reason: "text-entry" })
    })

    it("does not guard a keystroke outside a field", () => {
      const event = keyEvent({ key: "Backspace" }, "mac", { target: document.body })

      expect(dispatcher().handle(event)).toEqual({ type: "ran", commandId: "edit.delete" })
    })
  })

  describe("overlays", () => {
    it("swallows a key that does not operate the overlay", () => {
      scopes = ["global", "studio", "canvas", "overlay.dialog"]
      const event = keyEvent({ key: "KeyD", mod: true }, "mac")

      expect(dispatcher().handle(event)).toEqual({ type: "ignored", reason: "overlay" })
      expect(ran).toEqual([])
    })

    it("still runs an overlay's own binding", () => {
      scopes = ["canvas", "overlay.command-palette"]
      commands.register(
        makeCommand({ id: "palette.close", run: () => void ran.push("palette.close") }),
      )
      keymap.register({
        commandId: "palette.close",
        binding: { key: "Escape" },
        scope: "overlay.command-palette",
      })

      expect(dispatcher().handle(keyEvent({ key: "Escape" }, "mac"))).toEqual({
        type: "ran",
        commandId: "palette.close",
      })
    })

    // ⌘K is bound in the overlay's own scope, so it reaches past the allowlist.
    it("runs a binding declared in the overlay scope even when the key is not allowlisted", () => {
      scopes = ["canvas", "overlay.command-palette"]
      commands.register(makeCommand({ id: "palette.filter", run: () => void ran.push("filter") }))
      keymap.register({
        commandId: "palette.filter",
        binding: { key: "KeyK", mod: true },
        scope: "overlay.command-palette",
      })

      expect(dispatcher().handle(keyEvent({ key: "KeyK", mod: true }, "mac"))).toEqual({
        type: "ran",
        commandId: "palette.filter",
      })
    })
  })

  describe("held keys", () => {
    it("repeats a binding that asked to", () => {
      const subject = dispatcher()
      subject.handle(keyEvent({ key: "ArrowUp" }, "mac"))
      subject.handle(keyEvent({ key: "ArrowUp" }, "mac", { repeat: true }))

      expect(ran).toEqual(["arrange.nudge-up", "arrange.nudge-up"])
    })

    // One keystroke, not forty — and the browser must not act on the repeat
    // either, or a held key scrolls the page.
    it("does not repeat a binding that did not ask to", () => {
      const event = keyEvent({ key: "KeyD", mod: true }, "mac", { repeat: true })

      expect(dispatcher().handle(event)).toEqual({ type: "ignored", reason: "repeat" })
      expect(event.defaultPrevented).toBe(true)
      expect(ran).toEqual([])
    })

    it("leaves a repeat of a declined-preventDefault binding to the browser", () => {
      keymap.register({
        commandId: "edit.delete",
        binding: { key: "KeyY", alt: true },
        scope: "canvas",
        preventDefault: false,
      })
      const event = keyEvent({ key: "KeyY", alt: true }, "mac", { repeat: true })

      dispatcher().handle(event)

      expect(event.defaultPrevented).toBe(false)
    })
  })

  describe("chords", () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("opens on the leader and runs on the continuation", () => {
      const subject = dispatcher()
      const leader = keyEvent({ key: "KeyK", alt: true }, "mac")

      expect(subject.handle(leader)).toEqual({ type: "chord-open", continuations: 1 })
      expect(leader.defaultPrevented).toBe(true)

      expect(subject.handle(keyEvent({ key: "KeyP" }, "mac"))).toEqual({
        type: "ran",
        commandId: "publish.publish",
      })
    })

    it("discards an unmatched continuation rather than acting on it", () => {
      const subject = dispatcher()
      subject.handle(keyEvent({ key: "KeyK", alt: true }, "mac"))

      const second = keyEvent({ key: "Backspace" }, "mac")

      expect(subject.handle(second)).toEqual({ type: "chord-cancelled", reason: "unmatched" })
      expect(second.defaultPrevented).toBe(true)
      expect(ran).toEqual([])
    })

    it("cancels on Escape", () => {
      const subject = dispatcher()
      subject.handle(keyEvent({ key: "KeyK", alt: true }, "mac"))

      expect(subject.handle(keyEvent({ key: "Escape" }, "mac"))).toEqual({
        type: "chord-cancelled",
        reason: "escape",
      })
    })

    it("times out, and the next stroke is an ordinary keystroke again", () => {
      const subject = dispatcher()
      subject.handle(keyEvent({ key: "KeyK", alt: true }, "mac"))

      vi.advanceTimersByTime(1_000)

      expect(subject.handle(keyEvent({ key: "KeyD", mod: true }, "mac"))).toEqual({
        type: "ran",
        commandId: "edit.duplicate",
      })
    })

    it("ignores a held key mid-chord rather than treating it as the second stroke", () => {
      const subject = dispatcher()
      subject.handle(keyEvent({ key: "KeyK", alt: true }, "mac"))

      expect(subject.handle(keyEvent({ key: "KeyK", alt: true }, "mac", { repeat: true }))).toEqual(
        {
          type: "ignored",
          reason: "repeat",
        },
      )
      expect(subject.handle(keyEvent({ key: "KeyP" }, "mac"))).toEqual({
        type: "ran",
        commandId: "publish.publish",
      })
    })

    it("does not run a continuation whose command stopped being available", () => {
      const subject = dispatcher()
      subject.handle(keyEvent({ key: "KeyK", alt: true }, "mac"))

      commands.unregister("publish.publish")

      expect(subject.handle(keyEvent({ key: "KeyP" }, "mac"))).toEqual({
        type: "ignored",
        reason: "unavailable",
      })
    })

    it("publishes the pending continuations to a subscriber", () => {
      const subject = dispatcher()
      const seen: number[] = []
      subject.onChord((outcome) => {
        seen.push(outcome.type === "open" ? outcome.continuations.length : 0)
      })

      subject.handle(keyEvent({ key: "KeyK", alt: true }, "mac"))
      subject.handle(keyEvent({ key: "Escape" }, "mac"))

      expect(seen).toEqual([1, 0])
    })

    it("stops publishing once the subscription is disposed", () => {
      const subject = dispatcher()
      const listener = vi.fn()
      subject.onChord(listener).dispose()

      subject.handle(keyEvent({ key: "KeyK", alt: true }, "mac"))

      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe("attach", () => {
    it("handles keystrokes on the target it was given", () => {
      const subject = dispatcher()
      const attachment = subject.attach(window)

      window.dispatchEvent(keyEvent({ key: "KeyD", mod: true }, "mac"))

      expect(ran).toEqual(["edit.duplicate"])

      attachment.dispose()
      window.dispatchEvent(keyEvent({ key: "KeyD", mod: true }, "mac"))

      expect(ran).toEqual(["edit.duplicate"])
    })

    it("abandons a pending chord when the window loses focus", () => {
      const subject = dispatcher()
      const attachment = subject.attach(window)

      window.dispatchEvent(keyEvent({ key: "KeyK", alt: true }, "mac"))
      window.dispatchEvent(new Event("blur"))
      window.dispatchEvent(keyEvent({ key: "KeyP" }, "mac"))

      expect(ran).toEqual([])

      attachment.dispose()
    })
  })

  describe("failure", () => {
    // A shortcut that silently fails is worse than one that throws: the person
    // presses it again, and again, and concludes the product is broken.
    it("reports a synchronous failure", () => {
      const onError = vi.fn()
      commands.register(
        makeCommand({
          id: "edit.explode",
          run: () => {
            throw new Error("boom")
          },
        }),
      )
      keymap.register({
        commandId: "edit.explode",
        binding: { key: "KeyE", alt: true },
        scope: "canvas",
      })

      dispatcher({ onError }).handle(keyEvent({ key: "KeyE", alt: true }, "mac"))

      expect(onError).toHaveBeenCalledWith(expect.any(Error), "edit.explode")
    })

    it("reports a rejected promise", async () => {
      const onError = vi.fn()
      commands.register(
        makeCommand({ id: "file.save", run: () => Promise.reject(new Error("offline")) }),
      )
      keymap.register({
        commandId: "file.save",
        binding: { key: "KeyS", mod: true },
        scope: "canvas",
      })

      dispatcher({ onError }).handle(keyEvent({ key: "KeyS", mod: true }, "mac"))
      await vi.waitFor(() => expect(onError).toHaveBeenCalled())

      expect(onError).toHaveBeenCalledWith(expect.any(Error), "file.save")
    })

    it("awaits a command that succeeds without reporting anything", async () => {
      const onError = vi.fn()
      commands.register(makeCommand({ id: "file.sync", run: () => Promise.resolve() }))
      keymap.register({
        commandId: "file.sync",
        binding: { key: "KeyS", alt: true },
        scope: "canvas",
      })

      dispatcher({ onError }).handle(keyEvent({ key: "KeyS", alt: true }, "mac"))
      await Promise.resolve()

      expect(onError).not.toHaveBeenCalled()
    })

    it("rethrows when nothing is listening, rather than swallowing it", () => {
      commands.register(
        makeCommand({
          id: "edit.explode",
          run: () => {
            throw new Error("boom")
          },
        }),
      )
      keymap.register({
        commandId: "edit.explode",
        binding: { key: "KeyE", alt: true },
        scope: "canvas",
      })

      expect(() => dispatcher().handle(keyEvent({ key: "KeyE", alt: true }, "mac"))).toThrow("boom")
    })
  })

  describe("defaults", () => {
    it("detects the platform when it is not told one", () => {
      const subject = new KeyboardDispatcher({
        getScopes: () => [],
        getContext: () => context,
      })

      expect(subject.handle(new KeyboardEvent("keydown", { code: "ShiftLeft" }))).toEqual({
        type: "ignored",
        reason: "modifier-only",
      })
    })
  })
})
