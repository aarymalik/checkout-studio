import { act, render, screen } from "@testing-library/react"
import { useState, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CommandRegistry } from "../../src/commands/registry"
import { KeymapRegistry } from "../../src/keyboard/registry"
import {
  KeyboardProvider,
  useActiveScopes,
  useChordHint,
  useKeyboard,
  type KeyboardProviderProps,
} from "../../src/keyboard/context"
import { useScope } from "../../src/keyboard/hooks/useScope"
import { useShortcut } from "../../src/keyboard/hooks/useShortcut"
import { useShortcutLabel } from "../../src/keyboard/hooks/useShortcutLabel"
import { keyEvent, makeCommand } from "../support"

describe("KeyboardProvider", () => {
  let commands: CommandRegistry
  let keymap: KeymapRegistry
  let ran: string[]

  function Provider({
    children,
    ...rest
  }: Omit<KeyboardProviderProps, "commands" | "keymap" | "platform">) {
    return (
      <KeyboardProvider commands={commands} keymap={keymap} platform="mac" {...rest}>
        {children}
      </KeyboardProvider>
    )
  }

  beforeEach(() => {
    commands = new CommandRegistry()
    keymap = new KeymapRegistry(commands)
    ran = []
  })

  afterEach(() => {
    document.body.innerHTML = ""
  })

  function press(binding: Parameters<typeof keyEvent>[0]): void {
    act(() => {
      window.dispatchEvent(keyEvent(binding, "mac"))
    })
  }

  it("installs one listener for the whole application", () => {
    commands.register(makeCommand({ id: "help.palette", run: () => void ran.push("palette") }))
    keymap.register({
      commandId: "help.palette",
      binding: { key: "KeyK", mod: true },
      scope: "global",
    })

    render(
      <Provider>
        <Scoped scope="global" />
      </Provider>,
    )

    press({ key: "KeyK", mod: true })

    expect(ran).toEqual(["palette"])
  })

  /*
   * Global is what "anywhere" means, and nothing declares it — so without this,
   * ⌘K works in no part of the product at all.
   */
  it("keeps the global scope active without anything declaring it", () => {
    commands.register(makeCommand({ id: "help.palette", run: () => void ran.push("palette") }))
    keymap.register({
      commandId: "help.palette",
      binding: { key: "KeyK", mod: true },
      scope: "global",
    })

    render(
      <Provider>
        <Scoped scope="studio" />
      </Provider>,
    )

    press({ key: "KeyK", mod: true })

    expect(ran).toEqual(["palette"])
  })

  it("stops listening when it unmounts", () => {
    commands.register(makeCommand({ id: "help.palette", run: () => void ran.push("palette") }))
    keymap.register({
      commandId: "help.palette",
      binding: { key: "KeyK", mod: true },
      scope: "global",
    })

    const view = render(
      <Provider>
        <Scoped scope="global" />
      </Provider>,
    )

    view.unmount()
    press({ key: "KeyK", mod: true })

    expect(ran).toEqual([])
  })

  it("throws a useful error outside a provider", () => {
    function Orphan(): ReactNode {
      useKeyboard()

      return null
    }

    expect(() => render(<Orphan />)).toThrow("inside a <KeyboardProvider>")
  })

  describe("useScope", () => {
    it("activates a scope while a component is mounted", () => {
      render(
        <Provider>
          <Scoped scope="canvas" />
          <ScopeReadout />
        </Provider>,
      )

      expect(screen.getByTestId("scopes")).toHaveTextContent("global,canvas")
    })

    it("releases it on unmount", () => {
      function Shell(): ReactNode {
        const [open, setOpen] = useState(true)

        return (
          <>
            <ScopeReadout />
            {open ? <Scoped scope="overlay.dialog" /> : null}
            <button type="button" onClick={() => setOpen(false)}>
              close
            </button>
          </>
        )
      }

      render(
        <Provider>
          <Shell />
        </Provider>,
      )

      expect(screen.getByTestId("scopes")).toHaveTextContent("global,overlay.dialog")

      act(() => {
        screen.getByRole("button").click()
      })

      expect(screen.getByTestId("scopes")).toHaveTextContent("global")
    })

    // Unmounting one of two open dialogs must not drop the scope the other needs.
    it("keeps a scope that two components both declare", () => {
      function Shell(): ReactNode {
        const [both, setBoth] = useState(true)

        return (
          <>
            <ScopeReadout />
            <Scoped scope="overlay.dialog" />
            {both ? <Scoped scope="overlay.dialog" /> : null}
            <button type="button" onClick={() => setBoth(false)}>
              close one
            </button>
          </>
        )
      }

      render(
        <Provider>
          <Shell />
        </Provider>,
      )

      act(() => {
        screen.getByRole("button").click()
      })

      expect(screen.getByTestId("scopes")).toHaveTextContent("overlay.dialog")
    })

    it("does nothing while inactive", () => {
      function Inactive(): ReactNode {
        useScope("canvas", false)

        return <ScopeReadout />
      }

      render(
        <Provider>
          <Inactive />
        </Provider>,
      )

      expect(screen.getByTestId("scopes")).toHaveTextContent("global")
    })
  })

  describe("useShortcut", () => {
    it("registers bindings while mounted and removes them after", () => {
      commands.register(makeCommand({ id: "plugin.insert", run: () => void ran.push("insert") }))

      function Plugin(): ReactNode {
        useScope("canvas")
        useShortcut(BINDINGS)

        return null
      }

      const view = render(
        <Provider>
          <Plugin />
        </Provider>,
      )

      press({ key: "KeyP" })
      expect(ran).toEqual(["insert"])

      view.unmount()
      press({ key: "KeyP" })
      expect(ran).toEqual(["insert"])
    })
  })

  describe("useShortcutLabel", () => {
    it("reads the label from the registry, so it can never go stale", () => {
      keymap.register({
        commandId: "edit.duplicate",
        binding: { key: "KeyD", mod: true },
        scope: "canvas",
      })

      function Label(): ReactNode {
        return <span data-testid="label">{useShortcutLabel("edit.duplicate")}</span>
      }

      render(
        <Provider>
          <Label />
        </Provider>,
      )

      expect(screen.getByTestId("label")).toHaveTextContent("⌘D")
    })

    it("renders nothing for a command with no binding", () => {
      function Label(): ReactNode {
        return <span data-testid="label">{useShortcutLabel("edit.duplicate") ?? "none"}</span>
      }

      render(
        <Provider>
          <Label />
        </Provider>,
      )

      expect(screen.getByTestId("label")).toHaveTextContent("none")
    })
  })

  describe("useChordHint", () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it("shows what a held leader could still become, and clears when it resolves", () => {
      commands.register(makeCommand({ id: "publish.publish", run: () => void ran.push("publish") }))
      keymap.register({
        commandId: "publish.publish",
        binding: { key: "KeyK", alt: true, chord: [{ key: "KeyP" }] },
        scope: "studio",
      })

      function Hint(): ReactNode {
        const continuations = useChordHint()

        return (
          <span data-testid="hint">
            {continuations.map((continuation) => continuation.commandId).join(",")}
          </span>
        )
      }

      render(
        <Provider>
          <Scoped scope="studio" />
          <Hint />
        </Provider>,
      )

      press({ key: "KeyK", alt: true })
      expect(screen.getByTestId("hint")).toHaveTextContent("publish.publish")

      press({ key: "KeyP" })
      expect(screen.getByTestId("hint")).toHaveTextContent("")
      expect(ran).toEqual(["publish"])
    })
  })

  describe("editor state", () => {
    it("asks the application for the state it cannot work out itself", () => {
      commands.register(
        makeCommand({
          id: "arrange.group",
          isAvailable: (context) => context.selectionCount > 1,
          run: () => void ran.push("group"),
        }),
      )
      keymap.register({
        commandId: "arrange.group",
        binding: { key: "KeyG", mod: true },
        scope: "canvas",
      })

      render(
        <KeyboardProvider
          commands={commands}
          keymap={keymap}
          platform="mac"
          getState={() => ({ selectionCount: 2, isDirty: true })}
        >
          <Scoped scope="canvas" />
        </KeyboardProvider>,
      )

      press({ key: "KeyG", mod: true })

      expect(ran).toEqual(["group"])
    })

    it("assumes nothing is selected when the application says nothing", () => {
      commands.register(
        makeCommand({
          id: "arrange.group",
          isAvailable: (context) => context.selectionCount > 1,
          run: () => void ran.push("group"),
        }),
      )
      keymap.register({
        commandId: "arrange.group",
        binding: { key: "KeyG", mod: true },
        scope: "canvas",
      })

      render(
        <Provider>
          <Scoped scope="canvas" />
        </Provider>,
      )

      press({ key: "KeyG", mod: true })

      expect(ran).toEqual([])
    })
  })

  describe("failure", () => {
    it("hands a command's failure to the application", () => {
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

      render(
        <KeyboardProvider commands={commands} keymap={keymap} platform="mac" onError={onError}>
          <Scoped scope="canvas" />
        </KeyboardProvider>,
      )

      press({ key: "KeyE", alt: true })

      expect(onError).toHaveBeenCalledWith(expect.any(Error), "edit.explode")
    })
  })

  describe("telemetry", () => {
    /**
     * Phases 7 and 8 shipped without any of this, which phases.md recorded as
     * outstanding against the universal criteria. The port is what closes it:
     * the editor reports a run and the application decides what that means, so
     * the engine never imports a metrics client.
     */
    it("reports a command run from a keystroke", () => {
      const runs: { commandId: string; source: string }[] = []

      commands.register(makeCommand({ id: "edit.duplicate" }))
      keymap.register({
        commandId: "edit.duplicate",
        binding: { key: "KeyD", mod: true },
        scope: "canvas",
      })

      render(
        <Provider telemetry={{ commandRan: (run) => runs.push(run) }}>
          <Scoped scope="canvas" />
        </Provider>,
      )

      press({ key: "KeyD", mod: true })

      expect(runs).toEqual([
        expect.objectContaining({ commandId: "edit.duplicate", source: "keyboard" }),
      ])
    })

    it("reports a run from a button as its own source", () => {
      const runs: { commandId: string; source: string }[] = []

      commands.register(makeCommand({ id: "view.zoom-in", run: () => void ran.push("zoom") }))

      function Pressable(): ReactNode {
        const { run } = useKeyboard()

        return (
          <button
            type="button"
            onClick={() =>
              run(
                "view.zoom-in",
                { scopes: ["studio"], selectionCount: 0, isEditingText: false, isDirty: false },
                "toolbar",
              )
            }
          >
            Zoom in
          </button>
        )
      }

      render(
        <Provider telemetry={{ commandRan: (run) => runs.push(run) }}>
          <Pressable />
        </Provider>,
      )

      act(() => {
        screen.getByRole("button", { name: "Zoom in" }).click()
      })

      /*
       * The source is the whole point of the label: a command run from a
       * toolbar two thousand times and never from a keystroke is a shortcut
       * nobody found.
       */
      expect(ran).toEqual(["zoom"])
      expect(runs).toEqual([
        expect.objectContaining({ commandId: "view.zoom-in", source: "toolbar" }),
      ])
    })

    it("does nothing for a command that is not registered", () => {
      const runs: unknown[] = []

      function Pressable(): ReactNode {
        const { run } = useKeyboard()

        return (
          <button
            type="button"
            onClick={() =>
              run(
                "nothing.here",
                { scopes: [], selectionCount: 0, isEditingText: false, isDirty: false },
                "toolbar",
              )
            }
          >
            Press
          </button>
        )
      }

      render(
        <Provider telemetry={{ commandRan: (run) => runs.push(run) }}>
          <Pressable />
        </Provider>,
      )

      // A control for an unbuilt feature stays absent rather than throwing.
      act(() => {
        screen.getByRole("button", { name: "Press" }).click()
      })

      expect(runs).toEqual([])
    })

    it("sends a button's failure to the same handler a keystroke uses", () => {
      const onError = vi.fn()

      commands.register(
        makeCommand({
          id: "edit.paste",
          run: () => {
            throw new Error("no clipboard")
          },
        }),
      )

      function Pressable(): ReactNode {
        const { run } = useKeyboard()

        return (
          <button
            type="button"
            onClick={() =>
              run(
                "edit.paste",
                { scopes: [], selectionCount: 0, isEditingText: false, isDirty: false },
                "toolbar",
              )
            }
          >
            Paste
          </button>
        )
      }

      render(
        <Provider onError={onError}>
          <Pressable />
        </Provider>,
      )

      act(() => {
        screen.getByRole("button", { name: "Paste" }).click()
      })

      // Every button in the application used to call `command.run` directly,
      // so a throw reached nothing and a rejection reached less than nothing.
      expect(onError).toHaveBeenCalledOnce()
    })
  })

  describe("platform", () => {
    it("detects the platform when it is not told one", () => {
      keymap.register({
        commandId: "edit.duplicate",
        binding: { key: "KeyD", mod: true },
        scope: "canvas",
      })

      function Label(): ReactNode {
        return <span data-testid="label">{useShortcutLabel("edit.duplicate")}</span>
      }

      render(
        <KeyboardProvider commands={commands} keymap={keymap}>
          <Label />
        </KeyboardProvider>,
      )

      // jsdom reports a Linux-like platform, so the label is the Windows form.
      expect(screen.getByTestId("label")).toHaveTextContent("Ctrl+D")
    })
  })
})

const BINDINGS = [
  { commandId: "plugin.insert", binding: { key: "KeyP" }, scope: "canvas" },
] as const

function Scoped({ scope }: { scope: Parameters<typeof useScope>[0] }): ReactNode {
  useScope(scope)

  return null
}

function ScopeReadout(): ReactNode {
  return <span data-testid="scopes">{useActiveScopes().join(",")}</span>
}
