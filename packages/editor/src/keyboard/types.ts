/**
 * The keyboard system's vocabulary.
 *
 * Every shape here is specified in docs/keyboard-shortcuts.md. The types are
 * kept apart from the code that uses them so that a plugin can describe a
 * binding without importing the dispatcher.
 */

/**
 * A keystroke, described by physical key rather than by the character it
 * produces.
 *
 * "KeyD" is the key where D sits on a US keyboard, whatever that key types on
 * a French one. Binding to the character means the shortcut moves when the
 * layout does, which is how a German user loses ⌘Z.
 */
export interface KeyBinding {
  /** A KeyboardEvent.code: "KeyD", "Digit1", "ArrowUp", "Escape". */
  key: string
  /** The primary modifier: Command on macOS, Control everywhere else. */
  mod?: boolean
  shift?: boolean
  alt?: boolean
  /**
   * Literal Control, even on macOS.
   *
   * Avoid it. It exists for the few bindings where the platforms genuinely
   * differ, and every use of it is a shortcut that reads differently on two
   * machines.
   */
  ctrl?: boolean
  /** A multi-stroke sequence: the leader, then this. */
  chord?: KeyBinding[]
}

export type ScopeId =
  | "global"
  | "dashboard"
  | "studio"
  | "canvas"
  | "canvas.selection"
  | "canvas.multi-selection"
  | "canvas.text-editing"
  | "layers"
  | "inspector"
  | "library"
  | "overlay.dialog"
  | "overlay.command-palette"
  | "overlay.context-menu"

export type Platform = "mac" | "other"

export interface ShortcutRegistration {
  /** The command this runs. It must already exist, and registration checks. */
  commandId: string
  binding: KeyBinding
  scope: ScopeId
  /** Higher wins when two bindings share a scope. Core defaults are 0. */
  priority?: number
  /** Repeat while held. Nudging uses it; nothing destructive does. */
  allowRepeat?: boolean
  /** Prevent the browser's own behaviour. On unless stated otherwise. */
  preventDefault?: boolean
  /** The plugin that registered it, when it was not us. */
  pluginId?: string
}

export interface ShortcutConflict {
  binding: KeyBinding
  scope: ScopeId
  commandIds: readonly string[]
  severity: "error" | "warning"
  reason: string
}

/** Undoes a registration. Returned so a plugin can clean up after itself. */
export interface Disposable {
  dispose: () => void
}
