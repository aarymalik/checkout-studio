import type { LibraryAsset } from "@checkout-studio/api"
import type { UploadKind } from "@checkout-studio/utils"

/**
 * Finding one asset among a thousand.
 *
 * Pure, and separate from the panel, for the reason `grid.ts` is: what matters
 * about a library of a thousand things is what happens at a thousand, and that
 * cannot be checked by rendering.
 *
 * All of it happens in the browser, over the list the server already sent.
 * Asking the server to search would be a round trip to filter a list that is
 * already in hand, and a thousand filenames is a few tens of kilobytes.
 *
 * See docs/phases.md Phase 14.
 */

export const SORTS = ["newest", "oldest", "name", "largest"] as const

export type Sort = (typeof SORTS)[number]

export const SORT_LABELS: Readonly<Record<Sort, string>> = {
  newest: "Newest first",
  oldest: "Oldest first",
  name: "Name",
  largest: "Largest first",
}

/** `all` rather than an absent value, so the control always has a selection. */
export type KindFilter = "all" | UploadKind

export interface Selection {
  /** Matched against the filename. Trimmed; empty means everything. */
  text: string
  kind: KindFilter
  sort: Sort
}

export const EVERYTHING: Selection = { text: "", kind: "all", sort: "newest" }

/**
 * Whether a filename contains what was typed.
 *
 * A substring and not the fuzzy match the command palette uses, deliberately.
 * A palette is launched — you type three letters at something you already know
 * the name of — while a file list is scanned, and fuzzy matching over
 * `hero-banner-2026-final.png` turns two letters into half the library.
 *
 * It also keeps the sort control meaning what it says. Fuzzy matching comes
 * with a relevance order, and an order that quietly replaces the one a merchant
 * chose is the kind of helpfulness nobody asked for.
 */
function matches(asset: LibraryAsset, text: string): boolean {
  return asset.fileName.toLowerCase().includes(text)
}

const COMPARE: Readonly<Record<Sort, (a: LibraryAsset, b: LibraryAsset) => number>> = {
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
  oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
  /*
   * Numeric, so `picture-2` comes before `picture-10` — which is the order
   * somebody who named ten files that way is expecting.
   *
   * `sensitivity: "base"` makes a capital letter no difference at all, so two
   * names differing only in case are a tie and keep the order they came in.
   * Without it the collation decides, and `apple.png` sorting before
   * `Apple.png` is an order the merchant cannot see the reason for.
   */
  name: (a, b) =>
    a.fileName.localeCompare(b.fileName, undefined, { numeric: true, sensitivity: "base" }),
  largest: (a, b) => b.sizeBytes - a.sizeBytes,
}

/**
 * The assets to show, in the order to show them.
 *
 * Filtering and ordering are separate: the search narrows the list and the
 * sort arranges it, and neither reaches into the other. A tie keeps the order
 * the server sent, because `sort` is stable — so two files uploaded in the same
 * second, or two of the same size, do not swap places between renders.
 */
export function selectAssets(
  assets: readonly LibraryAsset[],
  selection: Selection,
): readonly LibraryAsset[] {
  const text = selection.text.trim().toLowerCase()

  /*
   * No special case for an empty query: every string contains the empty one,
   * so `matches` already answers yes for everything, and a guard saying the
   * same thing again is a second place for the two answers to disagree.
   */
  const found = assets.filter(
    (asset) => (selection.kind === "all" || asset.kind === selection.kind) && matches(asset, text),
  )

  return found.sort(COMPARE[selection.sort])
}

/**
 * How many of each kind there are, for a filter that offers only what exists.
 *
 * A library of logos should not offer to show the videos in it. An asset whose
 * type this release no longer permits is counted under nothing, which is why
 * these add up to the library only when every row is a type we still accept.
 */
export function kindCounts(assets: readonly LibraryAsset[]): ReadonlyMap<UploadKind, number> {
  const counts = new Map<UploadKind, number>()

  for (const asset of assets) {
    if (asset.kind === null) continue

    counts.set(asset.kind, (counts.get(asset.kind) ?? 0) + 1)
  }

  return counts
}
