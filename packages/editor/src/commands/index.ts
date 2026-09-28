export type { Command, CommandCategory, CommandDescriptor, EditorContext } from "./types"
export { CommandRegistry, CommandRegistryError, commands } from "./registry"
export { fuzzyMatch, type FuzzyMatch } from "./fuzzy"
export {
  PaletteRegistry,
  createCommandSource,
  palette,
  type PaletteResult,
  type PaletteSource,
  type ParsedQuery,
} from "./palette"
