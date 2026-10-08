import type {
  Breakpoint,
  CheckoutSchema,
  Fragment,
  SchemaProblem,
  StyleState,
} from "@checkout-studio/schema"

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
/**
 * What the canvas has measured about itself.
 *
 * Geometry, not document: it exists so that something which is not the canvas
 * can act on the canvas's shape. Zooming to fit needs the size of the visible
 * area and the size of the page; zooming to the selection needs where the
 * selection is. All three are known only to a mounted canvas, and all three are
 * needed by commands, which are built once for the application and have no DOM.
 *
 * Zero while no canvas is mounted, which is how a command that needs geometry
 * reports itself unavailable rather than dividing by it.
 */
export interface CanvasMeasurements {
  /** The visible canvas area, in screen pixels. */
  surface: { width: number; height: number }
  /** The device frame, in canvas units. */
  frame: { x: number; y: number; width: number; height: number }
  /** The selection's bounding box in canvas units, or null when nothing is selected. */
  selection: { x: number; y: number; width: number; height: number } | null
}

export interface ViewportState {
  breakpoint: Breakpoint
  /** 0.1 to 4, per docs/editor-behavior.md. */
  zoom: number
  pan: { x: number; y: number }
  /** Written by the canvas, read by anything that has to act on its shape. */
  measured: CanvasMeasurements
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
  /**
   * The keyboard's drag, which is modal rather than held.
   *
   * Separate from the fields above because a pointer drag is a gesture that
   * ends when the button comes up, and this one waits: it stays until the user
   * drops it or puts it back.
   */
  keyboard: KeyboardDrag | null
}

/**
 * A node picked up by the keyboard, and where it would land.
 *
 * Declared here rather than in `src/dnd` because the store holds it, and the
 * store must not import from the drag layer: `dnd/validity` reads
 * `state/selectors`, so the edge back would be a cycle and
 * `pnpm boundaries` would say so. The same arrangement as `Corruption`.
 */
export interface KeyboardDrag {
  /** The node in the hand. */
  id: string
  /** Where it would land. The two values `move` takes. */
  parentId: string
  index: number
  /**
   * The document with the pending move applied.
   *
   * Carried so the next step is computed from where the node would be rather
   * than from where it still is. Never shown and never persisted — the drop
   * writes a single `move` to the real document instead.
   */
  provisional: CheckoutSchema
  /** How far it has been moved, so "back where it started" is knowable. */
  steps: number
}

export interface AssetsState {
  /** Ids only. The records live in the app; the store holds what the page uses. */
  used: readonly string[]
}

export interface PublishingState {
  publishedRevisionId: string | null
  publishedAt: number | null
}

/**
 * A document that broke a structural invariant, and what was wrong with it.
 *
 * Kept whatever happens next. docs/error-handling.md § State Corruption
 * Recovery: "We never delete a document we cannot read." It is the only copy of
 * whatever the person was doing, and they may be able to export it even when
 * nothing can load it.
 */
export interface Corruption {
  document: CheckoutSchema
  problems: readonly SchemaProblem[]
  at: number
}

export interface RecoveryState {
  /**
   * Null until a document arrived that does not hold together.
   *
   * Set means frozen: mutations are refused, the editor is read-only, and the
   * server's copy is the next thing to try. There is no third state, because
   * the only door corruption comes through is the one that replaces the
   * document — and that is also the one that clears history, so there is never
   * anything to walk back to. See the note on `recoveryFor` in store.ts.
   */
  corruption: Corruption | null
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
  recovery: RecoveryState
}
