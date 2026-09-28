import { afterEach, describe, expect, it } from "vitest"

import {
  bindingFromEvent,
  detectPlatform,
  formatBinding,
  platformFor,
  serializeBinding,
  serializeEvent,
} from "../../src/keyboard/normalize"
import { keyEvent } from "../support"

describe("platformFor", () => {
  it("reads a Mac out of any of the strings a browser offers", () => {
    expect(platformFor("macOS")).toBe("mac")
    expect(platformFor("MacIntel")).toBe("mac")
    expect(platformFor("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("mac")
    expect(platformFor("iPhone")).toBe("mac")
    expect(platformFor("iPad")).toBe("mac")
  })

  it("reports other for anything that is not Apple", () => {
    expect(platformFor("Win32")).toBe("other")
    expect(platformFor("Linux x86_64")).toBe("other")
  })

  // A request with no user-agent header at all, which is not an error.
  it("reports other for nothing", () => {
    expect(platformFor(null)).toBe("other")
    expect(platformFor(undefined)).toBe("other")
    expect(platformFor("")).toBe("other")
  })
})

describe("detectPlatform", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator")

  afterEach(() => {
    if (original === undefined) {
      Reflect.deleteProperty(globalThis, "navigator")
    } else {
      Object.defineProperty(globalThis, "navigator", original)
    }
  })

  function withNavigator(value: unknown): void {
    Object.defineProperty(globalThis, "navigator", { value, configurable: true, writable: true })
  }

  it("prefers userAgentData, which is the only non-deprecated source", () => {
    withNavigator({ userAgentData: { platform: "macOS" }, platform: "Win32" })

    expect(detectPlatform()).toBe("mac")
  })

  it("falls back to navigator.platform", () => {
    withNavigator({ platform: "MacIntel" })

    expect(detectPlatform()).toBe("mac")
  })

  it("falls back to the user agent string", () => {
    withNavigator({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)" })

    expect(detectPlatform()).toBe("mac")
  })

  it("reports other for anything that is not Apple", () => {
    withNavigator({ platform: "Win32" })

    expect(detectPlatform()).toBe("other")
  })

  // Server rendering reaches this, and throwing there would break the shell
  // before it painted.
  it("reports other when there is no navigator at all", () => {
    Reflect.deleteProperty(globalThis, "navigator")

    expect(detectPlatform()).toBe("other")
  })

  /*
   * Node reports the *server's* platform: navigator.platform is "MacIntel" on a
   * developer's machine and "Linux x86_64" in production. Trusting it on the
   * server would render Ctrl to a Mac user and flip it to ⌘ on hydration, so
   * this refuses to answer off the browser at all.
   */
  it("refuses to guess where there is no window, whatever navigator says", () => {
    withNavigator({ platform: "MacIntel" })
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window")
    Reflect.deleteProperty(globalThis, "window")

    try {
      expect(detectPlatform()).toBe("other")
    } finally {
      if (descriptor !== undefined) Object.defineProperty(globalThis, "window", descriptor)
    }
  })
})

describe("serializeBinding", () => {
  it("writes modifiers in a fixed order, whatever order they were authored in", () => {
    const one = serializeBinding({ key: "KeyS", shift: true, mod: true, alt: true, ctrl: true })
    const two = serializeBinding({ key: "KeyS", mod: true, ctrl: true, alt: true, shift: true })

    expect(one).toBe("mod+ctrl+alt+shift+KeyS")
    expect(two).toBe(one)
  })

  it("leaves absent modifiers out rather than writing them as false", () => {
    expect(serializeBinding({ key: "Escape" })).toBe("Escape")
  })

  it("joins a chord with a space", () => {
    expect(serializeBinding({ key: "KeyK", alt: true, chord: [{ key: "KeyP" }] })).toBe(
      "alt+KeyK KeyP",
    )
  })

  it("ignores an empty chord array", () => {
    expect(serializeBinding({ key: "KeyK", alt: true, chord: [] })).toBe("alt+KeyK")
  })
})

describe("bindingFromEvent", () => {
  // The whole point of `mod`: one authored binding, the right physical key on
  // each platform.
  it("reads Command as mod on a Mac", () => {
    const event = new KeyboardEvent("keydown", { code: "KeyD", metaKey: true })

    expect(bindingFromEvent(event, "mac")).toEqual({ key: "KeyD", mod: true })
  })

  it("reads Control as mod everywhere else", () => {
    const event = new KeyboardEvent("keydown", { code: "KeyD", ctrlKey: true })

    expect(bindingFromEvent(event, "other")).toEqual({ key: "KeyD", mod: true })
  })

  it("does not read Control as mod on a Mac", () => {
    const event = new KeyboardEvent("keydown", { code: "KeyA", ctrlKey: true })

    expect(bindingFromEvent(event, "mac")).toEqual({ key: "KeyA", ctrl: true })
  })

  // Reporting Control twice off a Mac would stop every mod binding matching.
  it("does not also report literal Control off a Mac", () => {
    const event = new KeyboardEvent("keydown", { code: "KeyA", ctrlKey: true })

    expect(bindingFromEvent(event, "other")).toEqual({ key: "KeyA", mod: true })
  })

  it("carries alt and shift through", () => {
    const event = new KeyboardEvent("keydown", { code: "KeyZ", altKey: true, shiftKey: true })

    expect(bindingFromEvent(event, "mac")).toEqual({ key: "KeyZ", alt: true, shift: true })
  })

  // A binding must survive a keyboard layout: event.key for the key beside Tab
  // is "q" on a US keyboard and "a" on a French one.
  it("describes the physical key, not the character produced", () => {
    const event = new KeyboardEvent("keydown", { code: "KeyQ", key: "a" })

    expect(bindingFromEvent(event, "mac").key).toBe("KeyQ")
  })
})

describe("serializeEvent", () => {
  it("produces the same string a binding does", () => {
    const binding = { key: "KeyD", mod: true, shift: true }

    expect(serializeEvent(keyEvent(binding, "mac"), "mac")).toBe(serializeBinding(binding))
    expect(serializeEvent(keyEvent(binding, "other"), "other")).toBe(serializeBinding(binding))
  })
})

describe("formatBinding", () => {
  it("stacks symbols with no separator on a Mac", () => {
    expect(formatBinding({ key: "KeyZ", mod: true, shift: true }, "mac")).toBe("⇧⌘Z")
  })

  it("joins with a plus everywhere else", () => {
    expect(formatBinding({ key: "KeyZ", mod: true, shift: true }, "other")).toBe("Shift+Ctrl+Z")
  })

  it("puts literal Control before the others on a Mac and after them elsewhere", () => {
    expect(formatBinding({ key: "KeyA", ctrl: true }, "mac")).toBe("⌃A")
    expect(formatBinding({ key: "KeyA", ctrl: true }, "other")).toBe("Ctrl+A")
  })

  it("names alt by platform", () => {
    expect(formatBinding({ key: "Digit1", alt: true }, "mac")).toBe("⌥1")
    expect(formatBinding({ key: "Digit1", alt: true }, "other")).toBe("Alt+1")
  })

  it("uses Mac glyphs for the editing keys and words elsewhere", () => {
    expect(formatBinding({ key: "Backspace" }, "mac")).toBe("⌫")
    expect(formatBinding({ key: "Backspace" }, "other")).toBe("Backspace")
    expect(formatBinding({ key: "Delete" }, "mac")).toBe("⌦")
    expect(formatBinding({ key: "Delete" }, "other")).toBe("Del")
    expect(formatBinding({ key: "Enter" }, "mac")).toBe("↵")
    expect(formatBinding({ key: "Enter" }, "other")).toBe("Enter")
  })

  it("names the keys that have no letter", () => {
    expect(formatBinding({ key: "ArrowUp" }, "mac")).toBe("↑")
    expect(formatBinding({ key: "ArrowDown" }, "mac")).toBe("↓")
    expect(formatBinding({ key: "ArrowLeft" }, "mac")).toBe("←")
    expect(formatBinding({ key: "ArrowRight" }, "mac")).toBe("→")
    expect(formatBinding({ key: "Escape" }, "mac")).toBe("Esc")
    expect(formatBinding({ key: "BracketLeft" }, "mac")).toBe("[")
    expect(formatBinding({ key: "Slash" }, "mac")).toBe("/")
    expect(formatBinding({ key: "Tab" }, "mac")).toBe("Tab")
    expect(formatBinding({ key: "Space" }, "mac")).toBe("Space")
    expect(formatBinding({ key: "Comma" }, "mac")).toBe(",")
    expect(formatBinding({ key: "Period" }, "mac")).toBe(".")
    expect(formatBinding({ key: "Backquote" }, "mac")).toBe("`")
    expect(formatBinding({ key: "Minus" }, "mac")).toBe("−")
    expect(formatBinding({ key: "Equal" }, "mac")).toBe("+")
    expect(formatBinding({ key: "BracketRight" }, "mac")).toBe("]")
    expect(formatBinding({ key: "Backslash" }, "mac")).toBe("\\")
    expect(formatBinding({ key: "Semicolon" }, "mac")).toBe(";")
    expect(formatBinding({ key: "Quote" }, "mac")).toBe("'")
  })

  // An unlisted code is shown as-is rather than hidden: a wrong-looking label is
  // a bug report, a missing one is a mystery.
  it("falls back to the raw code for a key it has no name for", () => {
    expect(formatBinding({ key: "F13" }, "mac")).toBe("F13")
  })

  it("writes a chord as one stroke then the next", () => {
    expect(formatBinding({ key: "KeyK", alt: true, chord: [{ key: "KeyP" }] }, "mac")).toBe(
      "⌥K then P",
    )
  })

  it("ignores an empty chord array", () => {
    expect(formatBinding({ key: "KeyK", alt: true, chord: [] }, "mac")).toBe("⌥K")
  })
})
