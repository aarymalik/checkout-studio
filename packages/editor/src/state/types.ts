import type { Breakpoint, CheckoutSchema, Fragment, StyleState } from "@checkout-studio/schema"

/**
 * The editor's state.
 *
 * One store, in modules. The document is the only part that is ever persisted:
 * `toSchema` drops everything else, because docs/schema.md says no UI state is
 * stored in the schema and a selection saved into a page would be somebody
 * else's selection when they opened it.
 *
 * See docs/state-management.md.
 */

/** Which way a page is being looked at. Never persisted. */
export interface ViewportState {
  breakpoint: Breakpoint
  /** 0.1 to 4, per docs/editor-behavior.md. */
  zoom: number
  pan: { x: number; y: number }
  /** Editing chrome, not the page. */
  showRulers: boolean
  showGuides: boolean
  showGrid: boolean
  snapping: boolean
}

export interface SelectionState {
  /** Ordered as selected. The first is the primary, which the inspector shows. */
  ids: readonly string[]
  /** Which state the inspector is editing: hover styles, focus styles. */
  editingState: StyleState
}

/** What was copied, and where from. */
export interface ClipboardState {
  fragment: Fragment | null
  /** So a paste into another project can say where it came from. */
  sourceProjectId: string | null
  /** Set by cut, so paste knows the source is already gone. */
  cut: boolean
  /**
   * Where the fragment was lifted from.
   *
   * What "paste in place" means: the same parent, at the same position among
   * its siblings. Without it, in-place paste is just paste.
   */
  origin: { parentId: string; index: number } | null
}

/** One point in the undo stack. */
export interface HistoryEntry {
  document: CheckoutSchema
  selection: readonly string[]
  /** What produced it, for the history panel. */
  label: string
  /**
   * Entries sharing a key, close together in time, collapse into one.
   *
   * Typing "Hello" is one undo step, not five; nudging ten times is one, not
   * ten. Null never groups.
   */
  groupKey: string | null
  at: number
}

export interface HistoryState {
  past: readonly HistoryEntry[]
  future: readonly HistoryEntry[]
  /** Depth of the open transaction. Zero means not in one. */
  transactionDepth: number
  /** The state a transaction started from, to be pushed when it commits. */
  pending: HistoryEntry | null
}

export type SaveStatus = "saved" | "modified" | "saving" | "error"

export interface PersistenceState {
  status: SaveStatus
  /** The draft version this session started from. Drives conflict detection. */
  baseVersion: number
  lastSavedAt: number | null
  /** Set when a save failed, for the status bar to explain. */
  error: string | null
  /** False while another session holds the lock. */
  canEdit: boolean
}

export interface DragState {
  /** The nodes being dragged. Empty when nothing is. */
  ids: readonly string[]
  overId: string | null
  position: "before" | "after" | "inside" | null
}

export interface AssetsState {
  /** Ids only. The records live in the app; the store holds what the page uses. */
  used: readonly string[]
}

export interface PublishingState {
  publishedRevisionId: string | null
  publishedAt: number | null
}

export interface BuilderState {
  document: CheckoutSchema
  selection: SelectionState
  viewport: ViewportState
  history: HistoryState
  clipboard: ClipboardState
  persistence: PersistenceState
  drag: DragState
  assets: AssetsState
  publishing: PublishingState
}
