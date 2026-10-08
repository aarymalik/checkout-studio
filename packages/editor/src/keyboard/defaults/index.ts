import type { ShortcutRegistration } from "../types"
import { globalShortcuts } from "./global"
import { arrangeShortcuts } from "./arrange"
import { dndShortcuts } from "./dnd"
import { editShortcuts } from "./edit"
import { selectionShortcuts } from "./selection"
import { shellShortcuts } from "./shell"
import { viewportShortcuts } from "./viewport"

export { arrangeShortcuts } from "./arrange"
export { dndShortcuts } from "./dnd"
export { editShortcuts } from "./edit"
export { globalShortcuts } from "./global"
export { selectionShortcuts } from "./selection"
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
  ...arrangeShortcuts,
  ...selectionShortcuts,
  ...dndShortcuts,
]
