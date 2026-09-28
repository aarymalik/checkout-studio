import type { ShortcutRegistration } from "../types"
import { globalShortcuts } from "./global"
import { shellShortcuts } from "./shell"

export { globalShortcuts } from "./global"
export { shellShortcuts } from "./shell"
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
]
