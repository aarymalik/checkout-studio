import { fuzzyMatch } from "../commands/fuzzy"
import type { LayerRow } from "./tree"

/**
 * Filtering the layers panel.
 *
 * The same fuzzy matcher the command palette uses, so "ordsum" finds the order
 * summary in both places. A user who learns the search in one surface should
 * not have to learn it again in the other.
 *
 * A match keeps its ancestors. A row shown without the chain above it is a row
 * with no context — the user sees "Price" four times and cannot tell which card
 * each belongs to.
 */

export interface SearchResult {
  rows: readonly LayerRow[]
  /** The ids that actually matched, so the panel can emphasise them. */
  matched: ReadonlySet<string>
}

export function searchLayers(rows: readonly LayerRow[], query: string): SearchResult {
  const trimmed = query.trim()

  if (trimmed === "") return { rows, matched: new Set() }

  const byId = new Map(rows.map((row) => [row.id, row]))
  const matched = new Set<string>()

  for (const row of rows) {
    if (fuzzyMatch(row.label, trimmed) !== null) matched.add(row.id)
  }

  if (matched.size === 0) return { rows: [], matched }

  // Ancestors of a match are kept so each result reads in context.
  const keep = new Set<string>(matched)

  for (const id of matched) {
    let parentId = byId.get(id)?.parentId

    while (parentId !== null && parentId !== undefined && !keep.has(parentId)) {
      keep.add(parentId)
      parentId = byId.get(parentId)?.parentId
    }
  }

  return { rows: rows.filter((row) => keep.has(row.id)), matched }
}
