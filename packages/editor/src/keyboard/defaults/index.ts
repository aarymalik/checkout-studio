import type { ShortcutRegistration } from "../types"
import { globalShortcuts } from "./global"
import { editShortcuts } from "./edit"
import { shellShortcuts } from "./shell"
import { viewportShortcuts } from "./viewport"

export { editShortcuts } from "./edit"
export { globalShortcuts } from "./global"
export { shellShortcuts } from "./shell"
export { viewportShortcuts } from "./viewport"
export { paletteKeys } from "./overlay"
export type { ContextualKey } from "./overlay"

/**
 * Every binding the core editor ships.
 *
 * Canvas, layer, inspector and insertion bindings arrive with the features they
 * operate — a binding to a command that does not exist yet is a conflict error,
 * which is deliberate: it keeps the keymap honest about what the product can
 * actually do.
 */
export const defaultShortcuts: readonly ShortcutRegistration[] = [
  ...globalShortcuts,
  ...shellShortcuts,
  ...viewportShortcuts,
  ...editShortcuts,
]
