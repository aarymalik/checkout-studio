import type { KeyBinding, Platform } from "./types"
import { serializeBinding } from "./normalize"

/**
 * The text input guard.
 *
 * The most common shortcut bug in a visual editor is Backspace eating a
 * component while somebody was editing a heading. While a field has focus,
 * almost everything belongs to the field.
 *
 * See docs/keyboard-shortcuts.md § Text Input Guard.
 */

/** Whether the thing with focus is somewhere text is being typed. */
export function isTextEntry(target: EventTarget | null): boolean {
  if (target === null || !(target instanceof Element)) return false

  const element = target as HTMLElement

  if (element.isContentEditable) return true

  const tag = element.tagName
  if (tag === "TEXTAREA") return true

  if (tag === "INPUT") {
    const type = (element as HTMLInputElement).type
    // A checkbox is an input and is not text. Space on a checkbox belongs to
    // the checkbox; Space in a search field belongs to the field, and neither
    // belongs to the canvas.
    return !["checkbox", "radio", "button", "submit", "reset", "file", "range", "color"].includes(
      type,
    )
  }

  return false
}

/**
 * The bindings that still fire inside a text field.
 *
 * Short, and every entry is here for a stated reason. ⌘S is on the list because
 * without it the browser opens "Save page"; ⌘Z is on it because the text editor
 * wants it and will handle it itself.
 */
const ALLOWED_IN_TEXT: readonly KeyBinding[] = [
  { key: "Escape" },
  { key: "Enter", mod: true },
  { key: "KeyS", mod: true },
  { key: "KeyZ", mod: true },
  { key: "KeyZ", mod: true, shift: true },
  { key: "KeyB", mod: true },
  { key: "KeyI", mod: true },
  { key: "KeyU", mod: true },
  { key: "KeyK", mod: true },
]

const ALLOWED = new Set(ALLOWED_IN_TEXT.map(serializeBinding))

/**
 * Whether a keystroke may be intercepted while a text field has focus.
 *
 * Everything not on the list passes through, which is what makes Backspace
 * delete a character rather than a section, and ⌘A select the text rather than
 * every node on the canvas.
 */
export function passesTextGuard(binding: KeyBinding): boolean {
  return ALLOWED.has(serializeBinding(binding))
}

/** The allowed set, for the test that asserts what is on it and what is not. */
export function allowedInTextEntry(): readonly KeyBinding[] {
  return ALLOWED_IN_TEXT
}

/**
 * Whether a platform's own text-editing keys should be left alone.
 *
 * macOS uses Control with a letter for cursor movement inside a field — ⌃A to
 * the start of the line, ⌃E to the end, ⌃K to kill the rest. Binding those
 * would break habits that predate this product by forty years.
 */
export function isPlatformTextEditingKey(binding: KeyBinding, platform: Platform): boolean {
  if (platform !== "mac" || binding.ctrl !== true || binding.mod === true) return false

  return ["KeyA", "KeyE", "KeyK", "KeyD", "KeyF", "KeyB", "KeyN", "KeyP", "KeyH", "KeyT"].includes(
    binding.key,
  )
}
