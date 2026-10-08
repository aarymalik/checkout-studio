export type { Command, CommandCategory, CommandDescriptor, EditorContext } from "./types"
export { CommandRegistry, CommandRegistryError, commands } from "./registry"
export { fuzzyMatch, type FuzzyMatch } from "./fuzzy"
export { runCommand } from "./run"
export type { CommandRun, CommandSource, CommandTelemetry, RunCommandOptions } from "./run"
export {
  PaletteRegistry,
  createCommandSource,
  palette,
  type PaletteResult,
  type PaletteSource,
  type ParsedQuery,
} from "./palette"
