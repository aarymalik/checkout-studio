import { describe, expect, it, vi } from "vitest"

import { createShellCommands } from "../../src/shell/commands"
import { createViewportCommands } from "../../src/canvas/commands"
import { SIDEBAR_TABS } from "../../src/shell/layout"
import type { ShellActions } from "../../src/shell/store"
import { CommandRegistry } from "../../src/commands/registry"
import { defaultShortcuts } from "../../src/keyboard/defaults"
import { makeContext } from "../support"

function recorder(): ShellActions & { calls: string[] } {
  const calls: string[] = []

  return {
    calls,
    resizeLeft: (width) => void calls.push(`resizeLeft:${width}`),
    resizeRight: (width) => void calls.push(`resizeRight:${width}`),
    toggleLeft: () => void calls.push("toggleLeft"),
    toggleRight: () => void calls.push("toggleRight"),
    toggleBoth: () => void calls.push("toggleBoth"),
    selectTab: (tab) => void calls.push(`selectTab:${tab}`),
    reset: () => void calls.push("reset"),
  }
}

describe("createShellCommands", () => {
  it("registers without conflict in a clean registry", () => {
    const registry = new CommandRegistry()

    expect(() => registry.registerAll(createShellCommands(recorder()))).not.toThrow()
  })

  it("offers a command per sidebar tab", () => {
    const ids = createShellCommands(recorder()).map((command) => command.id)

    for (const tab of SIDEBAR_TABS) expect(ids).toContain(`view.sidebar.${tab}`)
  })

  // There is always a panel to toggle, with or without a selection.
  it("is always available", () => {
    for (const command of createShellCommands(recorder())) {
      expect(command.isAvailable(makeContext())).toBe(true)
    }
  })

  it("changes nothing about the document", () => {
    for (const command of createShellCommands(recorder())) {
      expect(command.mutates).toBe(false)
    }
  })

  it("runs the action it names", () => {
    const actions = recorder()
    const commands = createShellCommands(actions)
    const context = makeContext()

    for (const command of commands) void command.run(context)

    expect(actions.calls).toEqual([
      "toggleLeft",
      "toggleRight",
      "toggleBoth",
      "reset",
      ...SIDEBAR_TABS.map((tab) => `selectTab:${tab}`),
    ])
  })

  it("titles every command in sentence case, with no trailing punctuation", () => {
    for (const command of createShellCommands(recorder())) {
      expect(command.title).toMatch(/^[A-Z][^.]*[^.]$/)
    }
  })

  /**
   * Exit criterion: every command is reachable, and every binding names a
   * command that exists. The two halves were written apart, and this is what
   * stops them drifting.
   */
  /*
   * Every studio binding points at a command that exists.
   *
   * Two factories contribute them now — the frame's own, and the viewport's —
   * so the set is the union. What the test is protecting is unchanged: a
   * binding to a command nobody defines is a key that does nothing.
   */
  it("defines a command for every shell and sidebar binding", () => {
    const defined = new Set([
      ...createShellCommands(recorder()).map((command) => command.id),
      ...createViewportCommands({ store: () => null }).map((command) => command.id),
    ])
    const bound = defaultShortcuts
      .filter((registration) => registration.scope === "studio")
      .map((registration) => registration.commandId)

    expect(bound.filter((id) => !defined.has(id))).toEqual([])
  })

  it("does not define a command that nothing can reach", () => {
    const registry = new CommandRegistry()
    registry.registerAll(createShellCommands(recorder()))

    // Every shell command is either bound to a key or reachable from the
    // palette, which lists everything registered. Reset is palette-only.
    expect(registry.available(makeContext())).toHaveLength(10)
  })

  it("does not run an action until the command is run", () => {
    const actions = recorder()
    const spy = vi.spyOn(actions, "toggleLeft")

    createShellCommands(actions)

    expect(spy).not.toHaveBeenCalled()
  })
})
