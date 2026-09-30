import {
  validateReferences,
  type CheckoutSchema,
  type SchemaProblem,
} from "@checkout-studio/schema"

import type { HistoryEntry } from "./types"

/**
 * Corruption recovery.
 *
 * If the store ever holds a document that breaks a structural invariant — an
 * orphan, a cycle, a node in two places — the document is rebuilt rather than
 * repaired in place. Repairing means guessing at intent, and a guess about
 * somebody's page is a guess that changes it.
 *
 * The corrupted document is always kept, whatever happens next. We never delete
 * a document we cannot read: it is the only copy of whatever the person was
 * doing, and they may be able to export it even when nothing can load it.
 *
 * See docs/error-handling.md § State Corruption Recovery.
 */

export interface Corruption {
  document: CheckoutSchema
  problems: readonly SchemaProblem[]
  at: number
}

export type Recovery =
  /** A valid state was found in history. Editing resumes from it. */
  | {
      outcome: "restored"
      document: CheckoutSchema
      selection: readonly string[]
      stepsBack: number
    }
  /** Nothing in history was valid. The server's copy is the next thing to try. */
  | { outcome: "exhausted" }

/** Whether a document holds together. The same check validation runs. */
export function findProblems(document: CheckoutSchema): readonly SchemaProblem[] {
  return validateReferences(document)
}

export function isValid(document: CheckoutSchema): boolean {
  return findProblems(document).length === 0
}

/**
 * The most recent state in history that still holds together.
 *
 * Walked newest first, so the least work is lost. A corrupted document usually
 * means the operation that produced it was wrong, and the state before it was
 * fine — in which case one step back is all this costs.
 */
export function walkBack(past: readonly HistoryEntry[]): Recovery {
  for (let index = past.length - 1; index >= 0; index -= 1) {
    const entry = past[index] as HistoryEntry

    if (isValid(entry.document)) {
      return {
        outcome: "restored",
        document: entry.document,
        selection: entry.selection,
        stepsBack: past.length - index,
      }
    }
  }

  return { outcome: "exhausted" }
}

export interface RecoveryReport {
  corruption: Corruption
  recovery: Recovery
}

/**
 * Check a document, and say what to do if it is broken.
 *
 * Returns null when there is nothing wrong, which is the answer almost every
 * time it is called — this runs after mutations, so it has to be cheap to say
 * "fine" and is allowed to be slow only when it is not.
 */
export function inspect(
  document: CheckoutSchema,
  past: readonly HistoryEntry[],
  now: number,
): RecoveryReport | null {
  const problems = findProblems(document)

  if (problems.length === 0) return null

  return {
    // Kept whatever happens next: it is the only copy of what they were doing.
    corruption: { document, problems, at: now },
    recovery: walkBack(past),
  }
}
