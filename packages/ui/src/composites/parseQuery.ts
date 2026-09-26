/**
 * The command palette's mode prefixes, from docs/keyboard-shortcuts.md.
 *
 * A leading character narrows what is being searched. Parsing it here, as a
 * pure function, keeps the rule testable and keeps the component from carrying
 * a lookup table in the middle of its render.
 */
export const PALETTE_MODES = {
  ">": "commands",
  "#": "pages",
  "@": "components",
  ":": "nodes",
} as const

export type PaletteMode = (typeof PALETTE_MODES)[keyof typeof PALETTE_MODES] | "everything"

export interface ParsedQuery {
  mode: PaletteMode
  /** What to search for, with the prefix removed. */
  query: string
}

export function parseQuery(input: string): ParsedQuery {
  const prefix = input.slice(0, 1)
  const mode = PALETTE_MODES[prefix as keyof typeof PALETTE_MODES]

  if (mode === undefined) return { mode: "everything", query: input.trim() }

  // The prefix alone means "show me everything of this kind", not "search for
  // an empty string".
  return { mode, query: input.slice(1).trim() }
}
