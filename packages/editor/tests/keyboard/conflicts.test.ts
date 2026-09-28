import { describe, expect, it } from "vitest"

import {
  describe as describeConflicts,
  detectConflicts,
  explainRefusal,
  ShortcutConflictError,
} from "../../src/keyboard/conflicts"
import type { ShortcutRegistration } from "../../src/keyboard/types"

const anyCommand = { commandExists: () => true }

function registration(
  commandId: string,
  binding: ShortcutRegistration["binding"],
  scope: ShortcutRegistration["scope"] = "canvas",
  priority?: number,
): ShortcutRegistration {
  return priority === undefined
    ? { commandId, binding, scope }
    : { commandId, binding, scope, priority }
}

describe("detectConflicts", () => {
  it("finds nothing wrong with a clean keymap", () => {
    const conflicts = detectConflicts(
      [
        registration("edit.duplicate", { key: "KeyD", mod: true }),
        registration("edit.delete", { key: "Backspace" }),
      ],
      anyCommand,
    )

    expect(conflicts).toEqual([])
  })

  // Equal priority means nothing decides the winner, so there is no correct
  // behaviour to fall back on.
  it("errors when two commands share a binding at equal priority", () => {
    const conflicts = detectConflicts(
      [
        registration("edit.duplicate", { key: "KeyD", mod: true }),
        registration("edit.detach", { key: "KeyD", mod: true }),
      ],
      anyCommand,
    )

    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]?.severity).toBe("error")
    expect(conflicts[0]?.commandIds).toEqual(["edit.duplicate", "edit.detach"])
  })

  it("treats differing priority as a deliberate override, and names the winner", () => {
    const conflicts = detectConflicts(
      [
        registration("edit.duplicate", { key: "KeyD", mod: true }),
        registration("plugin.duplicate", { key: "KeyD", mod: true }, "canvas", 10),
      ],
      anyCommand,
    )

    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]?.severity).toBe("warning")
    expect(conflicts[0]?.reason).toContain("plugin.duplicate")
  })

  // The same key in two scopes is the whole point of scopes.
  it("does not mind the same binding in different scopes", () => {
    const conflicts = detectConflicts(
      [
        registration("layers.search", { key: "KeyF", mod: true }, "layers"),
        registration("inspector.search", { key: "KeyF", mod: true }, "inspector"),
      ],
      anyCommand,
    )

    expect(conflicts).toEqual([])
  })

  it("warns, rather than errors, when one command is bound twice the same way", () => {
    const conflicts = detectConflicts(
      [
        registration("edit.delete", { key: "Backspace" }),
        registration("edit.delete", { key: "Backspace" }),
      ],
      anyCommand,
    )

    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]?.severity).toBe("warning")
    expect(conflicts[0]?.commandIds).toEqual(["edit.delete"])
  })

  it("errors on a binding to a command that does not exist", () => {
    const conflicts = detectConflicts([registration("ghost.command", { key: "KeyG", alt: true })], {
      commandExists: () => false,
    })

    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]?.severity).toBe("error")
    expect(conflicts[0]?.reason).toContain("ghost.command")
  })

  it("errors on a reserved key", () => {
    const conflicts = detectConflicts(
      [registration("edit.close", { key: "KeyW", mod: true })],
      anyCommand,
    )

    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]?.severity).toBe("error")
    expect(conflicts[0]?.reason).toContain("operating system")
  })

  // Reporting one problem and stopping means the next run finds the next one.
  it("reports every problem in one pass", () => {
    const conflicts = detectConflicts(
      [
        registration("edit.close", { key: "KeyW", mod: true }),
        registration("a.one", { key: "KeyJ", alt: true }),
        registration("a.two", { key: "KeyJ", alt: true }),
      ],
      anyCommand,
    )

    expect(conflicts).toHaveLength(2)
  })

  it("ignores modifier order when comparing bindings", () => {
    const conflicts = detectConflicts(
      [
        registration("a.one", { key: "KeyJ", mod: true, shift: true }),
        registration("a.two", { key: "KeyJ", shift: true, mod: true }),
      ],
      anyCommand,
    )

    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]?.severity).toBe("error")
  })
})

describe("ShortcutConflictError", () => {
  it("carries the conflicts and describes each one on its own line", () => {
    const conflicts = detectConflicts(
      [registration("a.one", { key: "KeyJ" }), registration("a.two", { key: "KeyJ" })],
      anyCommand,
    )
    const error = new ShortcutConflictError(conflicts)

    expect(error.name).toBe("ShortcutConflictError")
    expect(error.conflicts).toBe(conflicts)
    expect(error.message).toContain("KeyJ")
    expect(error.message).toContain("canvas")
  })
})

describe("describeConflicts", () => {
  it("writes one actionable line per conflict", () => {
    const lines = describeConflicts([
      {
        binding: { key: "KeyW", mod: true },
        scope: "canvas",
        commandIds: ["edit.close"],
        severity: "error",
        reason: "Taken.",
      },
    ])

    expect(lines).toBe("  [error] mod+KeyW in canvas: Taken.")
  })
})

describe("explainRefusal", () => {
  it("explains a refusal rather than failing silently", () => {
    expect(explainRefusal({ key: "KeyW", mod: true }, "canvas")).toContain("operating system")
  })

  it("returns null for a binding that may be used", () => {
    expect(explainRefusal({ key: "KeyD", mod: true }, "canvas")).toBeNull()
  })
})
