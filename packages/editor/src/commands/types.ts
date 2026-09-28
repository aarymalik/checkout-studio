/**
 * Commands.
 *
 * The single unit of user intent, per docs/README.md: one definition reached
 * from a keyboard shortcut, the command palette, a toolbar button and a context
 * menu alike. A feature that exists in only one of those four is a feature
 * somebody cannot find.
 */

export type CommandCategory =
  | "file"
  | "edit"
  | "insert"
  | "selection"
  | "arrange"
  | "view"
  | "theme"
  | "publish"
  | "navigation"
  | "help"
  | "plugin"

/**
 * What a command is allowed to know about the moment it runs in.
 *
 * Deliberately small. A command that reaches for the document directly is a
 * command that cannot be tested without one, and the editor state engine does
 * not exist until Phase 5 — so this is the shape it will fill, not a stand-in
 * for it.
 */
export interface EditorContext {
  /** Which parts of the interface are active, deepest last. */
  scopes: readonly string[]
  /** How many nodes are selected. Zero on the dashboard. */
  selectionCount: number
  /** Whether a text field or inline editor currently has focus. */
  isEditingText: boolean
  /** Whether the document has unsaved changes. */
  isDirty: boolean
}

export interface Command {
  /** Stable, dotted, and never translated: "edit.duplicate". */
  id: string
  /** Shown to a person. Sentence case, no trailing punctuation. */
  title: string
  category: CommandCategory
  /** Extra words the palette should match on. */
  keywords?: readonly string[]
  /**
   * May this run right now?
   *
   * Checked before the command appears in the palette and before a shortcut
   * fires. A command that is unavailable is shown greyed rather than hidden,
   * so the interface does not rearrange itself as selection changes.
   */
  isAvailable: (context: EditorContext) => boolean
  /** Optional toggle state, for a checkmark in a menu. */
  isActive?: (context: EditorContext) => boolean
  run: (context: EditorContext, args?: unknown) => void | Promise<void>
  /** Whether it changes the document. Drives history grouping in Phase 5. */
  mutates: boolean
  /** The plugin that contributed it, when it was not us. */
  pluginId?: string
}
