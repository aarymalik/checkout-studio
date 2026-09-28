/**
 * Subsequence matching, for the command palette.
 *
 * Typing "dupl" should find Duplicate, and typing "dp" should too. Every
 * character of the query must appear in order, but not adjacently — that is
 * what makes a palette feel like it is reading your mind rather than grepping.
 *
 * The scoring has one job: put the thing the person meant first. Contiguous
 * runs, word starts, and matches near the beginning all count for more.
 */

export interface FuzzyMatch {
  score: number
  /** Which characters matched, for highlighting. */
  indices: readonly number[]
}

const CONTIGUOUS_BONUS = 10
const WORD_START_BONUS = 12
const FIRST_CHARACTER_BONUS = 16
const GAP_PENALTY = 2
const MAX_GAP_PENALTY = 10
const LEADING_PENALTY = 1
const MAX_LEADING_PENALTY = 12
const UNMATCHED_PENALTY = 1

function isWordStart(haystack: string, at: number): boolean {
  if (at === 0) return true

  const previous = haystack.charCodeAt(at - 1)
  const space = previous === 32 || previous === 45 || previous === 46 || previous === 95

  if (space) return true

  // "checkoutStudio" — a capital after a lowercase starts a word.
  const current = haystack.charAt(at)

  return (
    current !== current.toLowerCase() &&
    haystack.charAt(at - 1) === haystack.charAt(at - 1).toLowerCase()
  )
}

/**
 * Score a candidate against a query, or null when it does not match.
 *
 * Greedy left to right: the first occurrence of each query character wins. A
 * full backtracking search would score a handful of cases better and cost more
 * than the 16 ms budget for 500 commands allows.
 */
export function fuzzyMatch(haystack: string, needle: string): FuzzyMatch | null {
  if (needle.length === 0) return { score: 0, indices: [] }
  if (needle.length > haystack.length) return null

  const lowerHaystack = haystack.toLowerCase()
  const lowerNeedle = needle.toLowerCase()
  const indices: number[] = []

  let score = 0
  let at = 0
  let previousIndex = -1

  for (const character of lowerNeedle) {
    const found = lowerHaystack.indexOf(character, at)
    if (found === -1) return null

    if (previousIndex >= 0) {
      const skipped = found - previousIndex - 1

      // Contiguity is what separates "Duplicate" from "Delete Up" for "dup".
      // Without a penalty for the gap, a word-start bonus halfway down a long
      // title outscores an exact prefix.
      if (skipped === 0) score += CONTIGUOUS_BONUS
      else score -= Math.min(skipped * GAP_PENALTY, MAX_GAP_PENALTY)
    }

    if (isWordStart(haystack, found)) score += WORD_START_BONUS
    if (found === 0) score += FIRST_CHARACTER_BONUS

    indices.push(found)
    previousIndex = found
    at = found + 1
  }

  // A match that starts late is usually a coincidence.
  const firstIndex = indices[0] as number
  score -= Math.min(firstIndex * LEADING_PENALTY, MAX_LEADING_PENALTY)

  // Between two matches, prefer the shorter candidate: "Group" over "Ungroup".
  score -= (haystack.length - needle.length) * UNMATCHED_PENALTY

  return { score, indices }
}
