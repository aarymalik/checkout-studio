import { describe, expect, it } from "vitest"

import {
  allowedInTextEntry,
  isPlatformTextEditingKey,
  isTextEntry,
  passesTextGuard,
} from "../../src/keyboard/guards"

function input(type: string): HTMLInputElement {
  const element = document.createElement("input")
  element.type = type

  return element
}

describe("isTextEntry", () => {
  it("recognises a textarea", () => {
    expect(isTextEntry(document.createElement("textarea"))).toBe(true)
  })

  it("recognises a contenteditable element", () => {
    const element = document.createElement("div")
    element.contentEditable = "true"
    // jsdom does not implement isContentEditable, so it is asserted directly.
    Object.defineProperty(element, "isContentEditable", { value: true })

    expect(isTextEntry(element)).toBe(true)
  })

  it("recognises the text-like input types", () => {
    for (const type of ["text", "search", "email", "password", "url", "tel", "number"])
      expect(isTextEntry(input(type))).toBe(true)
  })

  // Space on a checkbox belongs to the checkbox; Space in a search field belongs
  // to the field; and neither belongs to the canvas.
  it("does not treat the non-text input types as text", () => {
    for (const type of ["checkbox", "radio", "button", "submit", "reset", "file", "range", "color"])
      expect(isTextEntry(input(type))).toBe(false)
  })

  it("does not treat an ordinary element as text", () => {
    expect(isTextEntry(document.createElement("div"))).toBe(false)
  })

  it("handles a keystroke with no target at all", () => {
    expect(isTextEntry(null)).toBe(false)
  })

  it("handles a target that is not an element, as window is", () => {
    expect(isTextEntry(window)).toBe(false)
  })
})

describe("passesTextGuard", () => {
  it("lets the documented handful through", () => {
    expect(passesTextGuard({ key: "Escape" })).toBe(true)
    expect(passesTextGuard({ key: "KeyS", mod: true })).toBe(true)
    expect(passesTextGuard({ key: "KeyK", mod: true })).toBe(true)
    expect(passesTextGuard({ key: "Enter", mod: true })).toBe(true)
    expect(passesTextGuard({ key: "KeyZ", mod: true, shift: true })).toBe(true)
  })

  // The bug this whole module exists to prevent.
  it("blocks the keys that would eat a component while somebody typed", () => {
    expect(passesTextGuard({ key: "Backspace" })).toBe(false)
    expect(passesTextGuard({ key: "Delete" })).toBe(false)
    expect(passesTextGuard({ key: "KeyA", mod: true })).toBe(false)
    expect(passesTextGuard({ key: "KeyD", mod: true })).toBe(false)
    expect(passesTextGuard({ key: "ArrowUp" })).toBe(false)
    expect(passesTextGuard({ key: "KeyS" })).toBe(false)
  })

  it("keeps the allowlist short, and every entry is a mod combination or Escape", () => {
    const allowed = allowedInTextEntry()

    expect(allowed.length).toBeLessThanOrEqual(10)

    for (const binding of allowed) {
      expect(binding.mod === true || binding.key === "Escape").toBe(true)
    }
  })
})

describe("isPlatformTextEditingKey", () => {
  // Forty years of habit: ⌃A to the start of the line, ⌃E to the end, ⌃K to
  // kill the rest.
  it("protects the macOS Emacs bindings", () => {
    for (const key of [
      "KeyA",
      "KeyE",
      "KeyK",
      "KeyD",
      "KeyF",
      "KeyB",
      "KeyN",
      "KeyP",
      "KeyH",
      "KeyT",
    ])
      expect(isPlatformTextEditingKey({ key, ctrl: true }, "mac")).toBe(true)
  })

  it("does not protect them off a Mac, where Control is the primary modifier", () => {
    expect(isPlatformTextEditingKey({ key: "KeyA", ctrl: true }, "other")).toBe(false)
  })

  it("does not protect a Control letter that is not one of them", () => {
    expect(isPlatformTextEditingKey({ key: "KeyZ", ctrl: true }, "mac")).toBe(false)
  })

  it("does not protect a key without Control", () => {
    expect(isPlatformTextEditingKey({ key: "KeyA" }, "mac")).toBe(false)
  })

  it("does not protect ⌘⌃A, which is nobody's cursor movement", () => {
    expect(isPlatformTextEditingKey({ key: "KeyA", ctrl: true, mod: true }, "mac")).toBe(false)
  })
})
