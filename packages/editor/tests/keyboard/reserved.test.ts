import { describe, expect, it } from "vitest"

import {
  DOCUMENTED_EXCEPTIONS,
  isDocumentedException,
  isReserved,
  reservedBindings,
} from "../../src/keyboard/reserved"
import { serializeBinding } from "../../src/keyboard/normalize"
import { defaultShortcuts } from "../../src/keyboard/defaults"
import type { ScopeId } from "../../src/keyboard/types"

const EVERY_SCOPE: readonly ScopeId[] = [
  "global",
  "dashboard",
  "studio",
  "canvas",
  "canvas.selection",
  "canvas.multi-selection",
  "canvas.text-editing",
  "layers",
  "inspector",
  "library",
  "overlay.dialog",
  "overlay.command-palette",
  "overlay.context-menu",
]

describe("the reserved table", () => {
  // Taking ⌘W means somebody's muscle memory closes a tab they did not mean to
  // close. Every entry here is refused in every scope.
  it("reserves every listed key in every scope", () => {
    for (const binding of reservedBindings()) {
      for (const scope of EVERY_SCOPE) {
        expect(isReserved(binding, scope), `${serializeBinding(binding)} in ${scope}`).toBe(true)
      }
    }
  })

  it("covers the window and tab keys", () => {
    for (const key of ["KeyT", "KeyW", "KeyN", "KeyQ"])
      expect(isReserved({ key, mod: true }, "canvas")).toBe(true)
  })

  it("covers ⌘1 through ⌘9, which switch browser tabs", () => {
    for (let digit = 1; digit <= 9; digit += 1)
      expect(isReserved({ key: `Digit${digit}`, mod: true }, "canvas")).toBe(true)
  })

  it("covers the developer tools", () => {
    expect(isReserved({ key: "KeyI", mod: true, alt: true }, "canvas")).toBe(true)
    expect(isReserved({ key: "F12" }, "canvas")).toBe(true)
  })

  it("covers application switching", () => {
    expect(isReserved({ key: "Tab", mod: true }, "canvas")).toBe(true)
    expect(isReserved({ key: "Backquote", mod: true }, "canvas")).toBe(true)
  })

  it("leaves an unreserved key alone", () => {
    expect(isReserved({ key: "KeyD", mod: true }, "canvas")).toBe(false)
    expect(isReserved({ key: "Digit1", alt: true }, "studio")).toBe(false)
  })
})

describe("the conditionally reserved keys", () => {
  // Both panels are long lists with their own search field, and in both ⌘F means
  // "find in this list".
  it("allows ⌘F only in the panels that have their own search", () => {
    for (const scope of ["layers", "inspector", "library"] as const)
      expect(isReserved({ key: "KeyF", mod: true }, scope)).toBe(false)

    for (const scope of ["global", "canvas", "studio", "dashboard"] as const)
      expect(isReserved({ key: "KeyF", mod: true }, scope)).toBe(true)
  })

  it("allows ⌘L and ⌘R in the canvas only", () => {
    expect(isReserved({ key: "KeyL", mod: true }, "canvas")).toBe(false)
    expect(isReserved({ key: "KeyR", mod: true }, "canvas")).toBe(false)
    expect(isReserved({ key: "KeyL", mod: true }, "global")).toBe(true)
    expect(isReserved({ key: "KeyR", mod: true }, "studio")).toBe(true)
  })
})

describe("the documented exceptions", () => {
  it("names what each one shadows, so the trade is on the record", () => {
    for (const exception of DOCUMENTED_EXCEPTIONS) {
      expect(exception.shadows).not.toBe("")
      expect(exception.commandId).toMatch(/^[a-z]+\.[a-z-]+$/)
      expect(isDocumentedException(exception.binding)).toBe(true)
    }
  })

  it("does not claim a key that is not on the list", () => {
    expect(isDocumentedException({ key: "KeyW", mod: true })).toBe(false)
  })

  // Exit criterion: no browser or OS shortcut is shadowed outside a documented
  // exception. Every binding we ship is checked against the table it is
  // registered in.
  it("accounts for every binding the editor ships", () => {
    const offenders = defaultShortcuts.filter(
      (registration) =>
        isReserved(registration.binding, registration.scope) &&
        !isDocumentedException(registration.binding),
    )

    expect(offenders).toEqual([])
  })
})
