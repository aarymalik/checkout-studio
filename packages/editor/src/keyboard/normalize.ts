import type { KeyBinding, Platform } from "./types"

/**
 * Turning a keystroke into something comparable.
 *
 * Two problems are solved here. The first is that "the primary modifier" is
 * Command on a Mac and Control everywhere else, and authoring both is how one
 * of them goes stale. The second is that a binding must survive a keyboard
 * layout: `event.key` for the key beside Tab is "q" on a US keyboard and "a" on
 * a French one, so bindings are described by `event.code`, which is the
 * physical key.
 */

/** What platform this is running on. Falls back to "other" off the browser. */
export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other"

  // userAgentData where it exists, userAgent where it does not. Both are
  // hints rather than guarantees, which is fine: the cost of being wrong is a
  // shortcut label showing Ctrl to somebody holding Command.
  const platform =
    (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    navigator.userAgent

  return /mac|iphone|ipad|ipod/i.test(platform) ? "mac" : "other"
}

/**
 * A binding as a string, for comparing and for use as a map key.
 *
 * Modifiers are written in a fixed order so that the same combination always
 * produces the same string — otherwise two identical bindings authored in a
 * different order would not look like a conflict.
 */
export function serializeBinding(binding: KeyBinding): string {
  const parts: string[] = []

  if (binding.mod === true) parts.push("mod")
  if (binding.ctrl === true) parts.push("ctrl")
  if (binding.alt === true) parts.push("alt")
  if (binding.shift === true) parts.push("shift")
  parts.push(binding.key)

  const stroke = parts.join("+")

  return binding.chord === undefined || binding.chord.length === 0
    ? stroke
    : [stroke, ...binding.chord.map(serializeBinding)].join(" ")
}

/**
 * The binding an event represents.
 *
 * On a Mac the primary modifier is Command; elsewhere it is Control. The same
 * authored binding therefore matches a different physical key on each, which is
 * the point. Literal Control is reported on a Mac only — elsewhere Control *is*
 * mod, and reporting it twice would stop every Ctrl binding from matching.
 */
export function bindingFromEvent(event: KeyboardEvent, platform: Platform): KeyBinding {
  const binding: KeyBinding = { key: event.code }

  if (platform === "mac" ? event.metaKey : event.ctrlKey) binding.mod = true
  if (platform === "mac" && event.ctrlKey) binding.ctrl = true
  if (event.altKey) binding.alt = true
  if (event.shiftKey) binding.shift = true

  return binding
}

/** The keystroke an event represents, in the same form a binding serializes to. */
export function serializeEvent(event: KeyboardEvent, platform: Platform): string {
  return serializeBinding(bindingFromEvent(event, platform))
}

const MAC_SYMBOLS: Record<string, string> = {
  mod: "⌘",
  ctrl: "⌃",
  alt: "⌥",
  shift: "⇧",
}

const OTHER_SYMBOLS: Record<string, string> = {
  mod: "Ctrl",
  ctrl: "Ctrl",
  alt: "Alt",
  shift: "Shift",
}

/** The printable name of a physical key. */
function keyLabel(code: string, platform: Platform): string {
  if (code.startsWith("Key")) return code.slice(3)
  if (code.startsWith("Digit")) return code.slice(5)

  const named: Record<string, string> = {
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Enter: platform === "mac" ? "↵" : "Enter",
    Backspace: platform === "mac" ? "⌫" : "Backspace",
    Delete: platform === "mac" ? "⌦" : "Del",
    Escape: "Esc",
    Space: "Space",
    Slash: "/",
    Comma: ",",
    Period: ".",
    BracketLeft: "[",
    BracketRight: "]",
    Backquote: "`",
    Minus: "−",
    Equal: "+",
    Tab: "Tab",
  }

  return named[code] ?? code
}

/**
 * A binding written the way it is shown to a person.
 *
 * macOS stacks symbols with no separator, which is what every Mac application
 * does. Everywhere else they are joined with "+", which is what every other
 * application does. Getting this wrong is a small thing that makes an interface
 * feel foreign.
 */
export function formatBinding(binding: KeyBinding, platform: Platform): string {
  const symbols = platform === "mac" ? MAC_SYMBOLS : OTHER_SYMBOLS
  const parts: string[] = []

  // Written in the order a person reads them, which is not the order they are
  // serialized in.
  if (binding.ctrl === true && platform === "mac") parts.push(symbols["ctrl"] as string)
  if (binding.alt === true) parts.push(symbols["alt"] as string)
  if (binding.shift === true) parts.push(symbols["shift"] as string)
  if (binding.mod === true) parts.push(symbols["mod"] as string)
  if (binding.ctrl === true && platform !== "mac") parts.push(symbols["ctrl"] as string)

  parts.push(keyLabel(binding.key, platform))

  const stroke = platform === "mac" ? parts.join("") : parts.join("+")

  return binding.chord === undefined || binding.chord.length === 0
    ? stroke
    : [stroke, ...binding.chord.map((next) => formatBinding(next, platform))].join(" then ")
}
