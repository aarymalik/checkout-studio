import type { KeyBinding, ScopeId } from "./types"
import { serializeBinding } from "./normalize"

/**
 * Keys the browser and the operating system keep.
 *
 * Taking ⌘W from somebody means their muscle memory closes something they did
 * not mean to close, or worse, does nothing and they press it again harder.
 * These are refused at registration time rather than ignored at dispatch time,
 * so a plugin that tries fails to load with a reason instead of failing
 * silently on a keystroke.
 *
 * See docs/keyboard-shortcuts.md § Reserved Keys.
 */
const RESERVED: readonly KeyBinding[] = [
  // Window and tab management.
  { key: "KeyT", mod: true },
  { key: "KeyW", mod: true },
  { key: "KeyN", mod: true },
  { key: "KeyQ", mod: true },
  { key: "KeyM", mod: true },
  { key: "KeyH", mod: true },
  { key: "KeyT", mod: true, shift: true },
  { key: "KeyN", mod: true, shift: true },
  { key: "KeyW", mod: true, shift: true },
  { key: "KeyA", mod: true, shift: true },
  { key: "KeyP", mod: true, shift: true },
  { key: "KeyY", mod: true },

  // Tab switching.
  ...Array.from({ length: 9 }, (_, index) => ({ key: `Digit${index + 1}`, mod: true })),

  // Browser and system.
  { key: "Comma", mod: true },
  { key: "ArrowLeft", mod: true },
  { key: "ArrowRight", mod: true },
  { key: "KeyP", mod: true },
  { key: "F5" },
  { key: "F11" },
  { key: "F12" },

  // Developer tools.
  { key: "KeyI", mod: true, alt: true },
  { key: "KeyJ", mod: true, alt: true },
  { key: "KeyC", mod: true, alt: true },

  // Application switching.
  { key: "Tab", mod: true },
  { key: "Tab", alt: true },
  { key: "Backquote", mod: true },
]

const RESERVED_KEYS = new Set(RESERVED.map(serializeBinding))

/**
 * ⌘F is the browser's find, except in the two panels that have their own.
 *
 * Both are long lists, both have a search field, and in both a person pressing
 * ⌘F means "find in this list" rather than "find on this page".
 */
const FIND_SCOPES: readonly ScopeId[] = ["layers", "inspector", "library"]

/**
 * Whether a binding may not be registered in a scope.
 *
 * ⌘L and ⌘R are conditionally reserved: they belong to the browser everywhere
 * except the canvas, where Figma and Framer have used them for so long that
 * matching them is the less surprising choice.
 */
export function isReserved(binding: KeyBinding, scope: ScopeId): boolean {
  const serialized = serializeBinding(binding)

  if (serialized === "mod+KeyF") return !FIND_SCOPES.includes(scope)
  if (serialized === "mod+KeyL" || serialized === "mod+KeyR") return scope !== "canvas"

  return RESERVED_KEYS.has(serialized)
}

/**
 * Browser shortcuts we deliberately take, and where.
 *
 * Every one matches Figma and Framer, which is the entire justification: a
 * person arriving from either expects ⌘D to duplicate. Each is bound in the
 * canvas scope only, and only takes the key when its command is actually
 * available — so with nothing selected, ⌘D still bookmarks the page.
 *
 * A binding that shadows a browser shortcut and is not on this list is a
 * defect, not a decision.
 */
export const DOCUMENTED_EXCEPTIONS: ReadonlyArray<{
  binding: KeyBinding
  commandId: string
  shadows: string
}> = [
  { binding: { key: "KeyD", mod: true }, commandId: "edit.duplicate", shadows: "Bookmark page" },
  { binding: { key: "KeyG", mod: true }, commandId: "arrange.group", shadows: "Find next" },
  {
    binding: { key: "KeyG", mod: true, shift: true },
    commandId: "arrange.ungroup",
    shadows: "Find previous",
  },
  {
    binding: { key: "BracketLeft", mod: true },
    commandId: "arrange.send-backward",
    shadows: "Back",
  },
  {
    binding: { key: "BracketRight", mod: true },
    commandId: "arrange.bring-forward",
    shadows: "Forward",
  },
  {
    binding: { key: "Digit0", mod: true },
    commandId: "view.zoom-reset",
    shadows: "Reset page zoom",
  },
  { binding: { key: "Equal", mod: true }, commandId: "view.zoom-in", shadows: "Zoom page in" },
  { binding: { key: "Minus", mod: true }, commandId: "view.zoom-out", shadows: "Zoom page out" },
  {
    binding: { key: "KeyH", mod: true, shift: true },
    commandId: "view.toggle-visibility",
    shadows: "Home page",
  },
  {
    binding: { key: "ArrowUp", mod: true },
    commandId: "arrange.move-up",
    shadows: "Scroll to top",
  },
  {
    binding: { key: "ArrowDown", mod: true },
    commandId: "arrange.move-down",
    shadows: "Scroll to bottom",
  },
  { binding: { key: "KeyL", mod: true }, commandId: "edit.lock", shadows: "Focus address bar" },
  { binding: { key: "KeyR", mod: true }, commandId: "view.toggle-rulers", shadows: "Reload" },
]

const EXCEPTIONS = new Set(DOCUMENTED_EXCEPTIONS.map((entry) => serializeBinding(entry.binding)))

/** Whether taking this key from the browser has been agreed in the docs. */
export function isDocumentedException(binding: KeyBinding): boolean {
  return EXCEPTIONS.has(serializeBinding(binding))
}

/** The reserved table, for the test that walks it. */
export function reservedBindings(): readonly KeyBinding[] {
  return RESERVED
}
