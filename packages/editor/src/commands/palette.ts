import type { Command, EditorContext } from "./types"
import { type CommandRegistry, commands as defaultCommands } from "./registry"
import { fuzzyMatch } from "./fuzzy"

/**
 * The command palette's search, without any of its markup.
 *
 * The palette shows more than commands: pages, components, nodes. None of those
 * exist yet, so rather than stubbing them, the palette asks whichever sources
 * are registered. A filter prefix with no source behind it is not a filter — it
 * is just a character somebody typed. Phase 5 and Phase 7 register the rest.
 *
 * See docs/keyboard-shortcuts.md § Command Palette.
 */

export interface PaletteResult {
  /** Unique within a search, for React keys and for the active-option id. */
  id: string
  title: string
  /** The group heading this sits under. */
  group: string
  /** Shown right-aligned: a shortcut, a page path, a category. */
  hint?: string
  /** Which characters of the title matched, for highlighting. */
  indices: readonly number[]
  score: number
  /** False renders it greyed rather than hiding it, so the list stays still. */
  isAvailable: boolean
  run: () => void | Promise<void>
}

export interface PaletteSource {
  id: string
  /** The character that filters to this source: ">", "#", "@", ":". */
  prefix: string
  /** The heading, and the label shown once the filter is active. */
  label: string
  search: (term: string, context: EditorContext) => readonly PaletteResult[]
}

export interface ParsedQuery {
  /** The source the prefix selected, or null for an unfiltered search. */
  source: PaletteSource | null
  /** What to search for, with any recognised prefix removed. */
  term: string
}

export class PaletteRegistry {
  private readonly sources = new Map<string, PaletteSource>()

  register(source: PaletteSource): { dispose: () => void } {
    this.sources.set(source.id, source)

    return {
      dispose: () => {
        this.sources.delete(source.id)
      },
    }
  }

  all(): readonly PaletteSource[] {
    return [...this.sources.values()]
  }

  /**
   * Split a raw input into a filter and a search term.
   *
   * An unrecognised prefix is left in the term. Somebody searching for ":hover"
   * with no node source registered is searching for ":hover".
   */
  parse(input: string): ParsedQuery {
    const trimmed = input.trimStart()
    const prefix = trimmed.charAt(0)
    const source = [...this.sources.values()].find((candidate) => candidate.prefix === prefix)

    return source === undefined
      ? { source: null, term: trimmed.trim() }
      : { source, term: trimmed.slice(1).trim() }
  }

  /**
   * Search, ranked.
   *
   * Unavailable results sort below available ones regardless of score: a person
   * scanning the list from the top should reach everything they can actually run
   * before anything they cannot.
   */
  search(input: string, context: EditorContext, limit = 50): readonly PaletteResult[] {
    const { source, term } = this.parse(input)
    const sources = source === null ? [...this.sources.values()] : [source]

    const results = sources.flatMap((candidate) => [...candidate.search(term, context)])

    results.sort((a, b) => {
      if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1
      if (b.score !== a.score) return b.score - a.score

      return a.title.localeCompare(b.title)
    })

    return results.slice(0, limit)
  }
}

/** Human names for the category shown beside each command. */
const CATEGORY_LABELS: Record<Command["category"], string> = {
  file: "File",
  edit: "Edit",
  insert: "Insert",
  selection: "Selection",
  arrange: "Arrange",
  view: "View",
  theme: "Theme",
  publish: "Publish",
  navigation: "Go to",
  help: "Help",
  plugin: "Plugin",
}

/**
 * The commands source, filtered by ">".
 *
 * Keywords widen what a command answers to without widening its name: "delete"
 * finds Remove, and "colour" finds Color, because somebody will type both.
 */
export function createCommandSource(
  options: {
    commands?: CommandRegistry
    /** The shortcut label to show, when there is one. */
    shortcutFor?: (commandId: string) => string | null
  } = {},
): PaletteSource {
  const registry = options.commands ?? defaultCommands

  return {
    id: "commands",
    prefix: ">",
    label: "Commands",
    search: (term, context) => {
      const results: PaletteResult[] = []

      for (const command of registry.all()) {
        const match = fuzzyMatch(command.title, term)
        const keywordMatch =
          match === null
            ? (command.keywords ?? []).some((keyword) => fuzzyMatch(keyword, term) !== null)
            : false

        if (match === null && !keywordMatch) continue

        const shortcut = options.shortcutFor?.(command.id) ?? null

        results.push({
          id: command.id,
          title: command.title,
          group: CATEGORY_LABELS[command.category],
          ...(shortcut === null ? {} : { hint: shortcut }),
          indices: match?.indices ?? [],
          // A keyword-only match is a weaker signal than a name match.
          score: match?.score ?? -20,
          isAvailable: command.isAvailable(context),
          run: () => command.run(context),
        })
      }

      return results
    },
  }
}

/** The application's palette sources. */
export const palette = new PaletteRegistry()
