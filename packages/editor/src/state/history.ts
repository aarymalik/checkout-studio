import type { CheckoutSchema } from "@checkout-studio/schema"

import type { HistoryEntry, HistoryState } from "./types"

/**
 * Undo and redo.
 *
 * Snapshots, not patches — a deliberate departure from the implementation step
 * in docs/phases.md, which names patches.
 *
 * The reason is that the document is already immutable and every tree operation
 * shares structure with what it was given: changing one node's props produces a
 * document that shares every other node object with its predecessor. A snapshot
 * therefore costs one new record spine, not a copy of the page — and a test in
 * this package measures that rather than asserting it.
 *
 * What snapshots buy is undo in constant time. Restoring a patch stack means
 * applying inverse patches in order; restoring a snapshot is assigning a
 * pointer, which is what keeps the 2,000-node undo target from being a
 * question at all.
 *
 * See docs/history-versioning.md § Local Undo History.
 */

/** Per docs/history-versioning.md. The oldest is discarded beyond this. */
export const HISTORY_LIMIT = 50

/**
 * How close together two actions must be to become one.
 *
 * Long enough that typing a word is one entry, short enough that typing a word,
 * thinking, and typing another is two.
 */
export const GROUP_WINDOW_MS = 600

export function emptyHistory(): HistoryState {
  return { past: [], future: [], transactionDepth: 0, pending: null }
}

export interface PushOptions {
  label: string
  /** Entries sharing a key within the window collapse. Null never groups. */
  groupKey?: string | null
  /**
   * When this happened.
   *
   * Required rather than defaulted to `Date.now()`. Grouping is a function of
   * time, and a pure function that reaches for the real clock is one whose
   * tests depend on how fast the machine is.
   */
  now: number
}

/**
 * Record where the document was before an action.
 *
 * The entry holds the *previous* state, which is what undo restores. Storing
 * the new state instead would make the first undo a no-op and the last one
 * impossible.
 */
export function push(
  history: HistoryState,
  before: HistoryEntry,
  options: PushOptions,
): HistoryState {
  const groupKey = options.groupKey ?? null
  const now = options.now
  const top = history.past.at(-1)

  // A run of the same action, close together, is one thing a person did. The
  // earliest entry is kept, because that is the state they would expect one
  // undo to return them to.
  const groups =
    top !== undefined &&
    groupKey !== null &&
    top.groupKey === groupKey &&
    now - top.at <= GROUP_WINDOW_MS

  if (groups) {
    return {
      ...history,
      past: [...history.past.slice(0, -1), { ...top, at: now }],
      future: [],
    }
  }

  const entry: HistoryEntry = { ...before, label: options.label, groupKey, at: now }
  const past = [...history.past, entry]

  return {
    ...history,
    // The oldest goes, not the newest: the recent past is what anyone undoes.
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    // Anything undone and then departed from is gone. Keeping it would offer a
    // redo into a future that no longer follows from the present.
    future: [],
  }
}

export interface Restored {
  history: HistoryState
  entry: HistoryEntry
}

/** The state before the last action, or null when there is none. */
export function undo(history: HistoryState, current: HistoryEntry): Restored | null {
  const entry = history.past.at(-1)

  if (entry === undefined) return null

  return {
    entry,
    history: {
      ...history,
      past: history.past.slice(0, -1),
      future: [...history.future, { ...current, label: entry.label, groupKey: null }],
    },
  }
}

/** The state that was undone, or null when nothing was. */
export function redo(history: HistoryState, current: HistoryEntry): Restored | null {
  const entry = history.future.at(-1)

  if (entry === undefined) return null

  return {
    entry,
    history: {
      ...history,
      past: [...history.past, { ...current, label: entry.label, groupKey: null }],
      future: history.future.slice(0, -1),
    },
  }
}

/** A point to return to, built from wherever the store is now. */
export function entryFor(
  document: CheckoutSchema,
  selection: readonly string[],
  label = "",
): HistoryEntry {
  return { document, selection, label, groupKey: null, at: 0 }
}
