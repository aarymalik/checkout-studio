import {
  createNode,
  duplicate as duplicateNode,
  extract,
  insert as insertNode,
  move as moveNode,
  regenerateIds,
  remove as removeNode,
  siblings as siblingsOf,
  subtreeIds,
  unwrap as unwrapNode,
  update as updateNode,
  wrap as wrapNode,
  type Breakpoint,
  type CheckoutSchema,
  type Fragment,
  type Node,
  type StyleProperties,
  type StyleState,
  type TreeOptions,
  type TreeResult,
} from "@checkout-studio/schema"
import { createStore, type StoreApi } from "zustand/vanilla"

import { emptyHistory, entryFor, push, redo, undo, type PushOptions } from "./history"
import type { BuilderState, CanvasMeasurements, HistoryEntry } from "./types"

/**
 * The editor store.
 *
 * Every mutation goes through one path: run a pure tree operation, and if it
 * succeeded, record where the document was and move it. That is what makes undo
 * work for operations nobody wrote undo code for, and what makes a failed
 * operation leave no trace — there is nothing to undo, because nothing happened.
 *
 * Vanilla zustand rather than the React binding: the store is the brain and has
 * no business knowing whether anything is rendering it. The React hooks live
 * beside it and subscribe.
 *
 * See docs/state-management.md.
 */

export interface EditorActions {
  // ── Document ──────────────────────────────────────────────────────────────
  /** Replace the document wholesale. Clears history; this is a new page. */
  load: (document: CheckoutSchema, baseVersion?: number) => void
  insert: (node: Node, parentId: string, index?: number) => TreeResult
  insertNew: (type: string, parentId: string, index?: number) => TreeResult
  move: (id: string, parentId: string, index?: number) => TreeResult
  remove: (ids: readonly string[]) => TreeResult
  duplicate: (ids: readonly string[]) => TreeResult
  wrap: (ids: readonly string[], type: string) => TreeResult
  unwrap: (id: string) => TreeResult
  setProps: (id: string, props: Record<string, unknown>) => TreeResult
  setStyles: (
    ids: readonly string[],
    styles: StyleProperties,
    where?: { breakpoint?: Breakpoint; state?: StyleState },
  ) => TreeResult
  setLocked: (ids: readonly string[], locked: boolean) => TreeResult
  setHidden: (ids: readonly string[], hidden: boolean) => TreeResult
  rename: (id: string, name: string) => TreeResult
  setTheme: (themeId: string) => void

  // ── Selection ─────────────────────────────────────────────────────────────
  select: (ids: readonly string[]) => void
  addToSelection: (id: string) => void
  toggleSelection: (id: string) => void
  clearSelection: () => void
  selectParent: () => void
  selectFirstChild: () => void
  selectSibling: (direction: 1 | -1) => void
  setEditingState: (state: StyleState) => void

  // ── History ───────────────────────────────────────────────────────────────
  undo: () => boolean
  redo: () => boolean
  /** Run several mutations as one undo step. */
  transact: <T>(label: string, run: () => T) => T

  // ── Clipboard ─────────────────────────────────────────────────────────────
  copy: () => boolean
  cut: () => TreeResult | null
  paste: (parentId?: string, index?: number) => TreeResult | null
  pasteInPlace: () => TreeResult | null
  pasteStyles: (ids?: readonly string[]) => TreeResult | null
  setClipboard: (fragment: Fragment | null, sourceProjectId?: string | null) => void

  // ── Viewport ──────────────────────────────────────────────────────────────
  setBreakpoint: (breakpoint: Breakpoint) => void
  setZoom: (zoom: number) => void
  setPan: (pan: { x: number; y: number }) => void
  /**
   * Both at once.
   *
   * Setting the zoom and then the pan renders once at the new scale with the
   * old offset, which is a visible jump at every step of a gesture.
   */
  setTransform: (transform: { zoom: number; pan: { x: number; y: number } }) => void
  /** What the canvas has measured about itself. Written by the canvas alone. */
  setMeasured: (measured: CanvasMeasurements) => void
  toggleViewportFlag: (flag: "showRulers" | "showGuides" | "showGrid" | "snapping") => void

  // ── Drag ──────────────────────────────────────────────────────────────────
  beginDrag: (ids: readonly string[]) => void
  setDropTarget: (overId: string | null, position: DragPosition | null) => void
  endDrag: () => void

  // ── Persistence ───────────────────────────────────────────────────────────
  markSaving: () => void
  markSaved: (version: number, at?: number) => void
  markSaveFailed: (message: string) => void
  setCanEdit: (canEdit: boolean) => void
}

export type DragPosition = "before" | "after" | "inside"

export type EditorStore = BuilderState & EditorActions
export type EditorStoreApi = StoreApi<EditorStore>

export interface CreateStoreOptions {
  document: CheckoutSchema
  baseVersion?: number
  /** Whether a component may hold children. The catalogue answers; the engine does not. */
  canHaveChildren?: TreeOptions["canHaveChildren"]
  random?: TreeOptions["random"]
  /** Injected so history grouping is testable without waiting. */
  now?: () => number
}

const ZOOM_MIN = 0.1
const ZOOM_MAX = 4

function initialState(document: CheckoutSchema, baseVersion: number): BuilderState {
  return {
    document,
    selection: { ids: [], editingState: "base" },
    viewport: {
      breakpoint: "desktop",
      zoom: 1,
      pan: { x: 0, y: 0 },
      showRulers: false,
      showGuides: true,
      showGrid: false,
      snapping: true,
      measured: {
        surface: { width: 0, height: 0 },
        frame: { x: 0, y: 0, width: 0, height: 0 },
        selection: null,
      },
    },
    history: emptyHistory(),
    clipboard: { fragment: null, sourceProjectId: null, cut: false, origin: null },
    persistence: {
      status: "saved",
      baseVersion,
      lastSavedAt: null,
      error: null,
      canEdit: true,
    },
    drag: { ids: [], overId: null, position: null },
    assets: { used: [] },
    publishing: { publishedRevisionId: null, publishedAt: null },
  }
}

export function createEditorStore(options: CreateStoreOptions): EditorStoreApi {
  const treeOptions: TreeOptions = {
    ...(options.canHaveChildren === undefined ? {} : { canHaveChildren: options.canHaveChildren }),
    ...(options.random === undefined ? {} : { random: options.random }),
  }
  const now = options.now ?? Date.now

  return createStore<EditorStore>()((set, get) => {
    /** Where the document is right now, as something history can hold. */
    function snapshot(): HistoryEntry {
      const state = get()

      return entryFor(state.document, state.selection.ids)
    }

    /**
     * Apply a tree operation, recording it in history if it worked.
     *
     * The single path every mutation takes. A failed operation returns its
     * reason and changes nothing — not the document, not history, not the
     * selection — so an undo after it is a no-op because there is nothing there.
     */
    function apply(
      result: TreeResult,
      options: Omit<PushOptions, "now">,
      after?: (state: BuilderState) => Partial<BuilderState>,
    ): TreeResult {
      if (!result.ok) return result

      const before = snapshot()

      set((state) => {
        const document = result.document
        const extra = after?.({ ...state, document }) ?? {}

        // Inside a transaction, the entry is held until it commits: several
        // operations become the one thing the person did.
        const history =
          state.history.transactionDepth > 0
            ? {
                ...state.history,
                pending: state.history.pending ?? before,
                future: [],
              }
            : push(state.history, before, { ...options, now: now() })

        return {
          ...state,
          document,
          history,
          persistence: { ...state.persistence, status: "modified" },
          ...extra,
        }
      })

      return result
    }

    /** Drop selected ids that are no longer in the document. */
    function pruneSelection(state: BuilderState): Partial<BuilderState> {
      const ids = state.selection.ids.filter((id) => state.document.nodes[id] !== undefined)

      return ids.length === state.selection.ids.length
        ? {}
        : { selection: { ...state.selection, ids } }
    }

    /** Run one operation per id, stopping at the first refusal. */
    function forEach(
      ids: readonly string[],
      operate: (document: CheckoutSchema, id: string) => TreeResult,
    ): TreeResult {
      let document = get().document

      for (const id of ids) {
        const result = operate(document, id)

        if (!result.ok) return result

        document = result.document
      }

      return { ok: true, document }
    }

    return {
      ...initialState(options.document, options.baseVersion ?? 0),

      // ── Document ───────────────────────────────────────────────────────────
      load: (document, baseVersion = 0) =>
        set((state) => ({
          ...initialState(document, baseVersion),
          viewport: state.viewport,
        })),

      insert: (node, parentId, index) =>
        apply(
          insertNode(
            get().document,
            { rootId: node.id, nodes: { [node.id]: node } },
            parentId,
            index,
            treeOptions,
          ),
          { label: "Insert" },
          () => ({ selection: { ...get().selection, ids: [node.id] } }),
        ),

      insertNew: (type, parentId, index) => {
        const node = createNode(
          type,
          new Set(Object.keys(get().document.nodes)),
          {},
          options.random,
        )

        return get().insert(node, parentId, index)
      },

      move: (id, parentId, index) =>
        apply(moveNode(get().document, id, parentId, index, treeOptions), { label: "Move" }),

      remove: (ids) =>
        apply(
          forEach(ids, (document, id) => removeNode(document, id)),
          { label: "Delete" },
          pruneSelection,
        ),

      duplicate: (ids) => {
        const created: string[] = []
        const result = forEach(ids, (document, id) => {
          const outcome = duplicateNode(document, id, treeOptions)

          if (outcome.ok) created.push(outcome.newId)

          return outcome
        })

        return apply(result, { label: "Duplicate" }, () =>
          created.length === 0 ? {} : { selection: { ...get().selection, ids: created } },
        )
      },

      wrap: (ids, type) => {
        const wrapper = createNode(
          type,
          new Set(Object.keys(get().document.nodes)),
          {},
          options.random,
        )

        return apply(
          wrapNode(get().document, ids, wrapper, treeOptions),
          { label: "Group" },
          () => ({
            selection: { ...get().selection, ids: [wrapper.id] },
          }),
        )
      },

      unwrap: (id) => apply(unwrapNode(get().document, id), { label: "Ungroup" }, pruneSelection),

      setProps: (id, props) =>
        apply(
          updateNode(get().document, id, (node) => ({
            ...node,
            props: { ...node.props, ...(props as Node["props"]) },
          })),
          // Grouped per node: editing one heading's text repeatedly is one undo
          // step, and editing a different node starts a new one.
          { label: "Edit", groupKey: `props:${id}` },
        ),

      setStyles: (ids, styles, where = {}) => {
        const breakpoint = where.breakpoint ?? get().viewport.breakpoint
        const state = where.state ?? get().selection.editingState

        return apply(
          forEach(ids, (document, id) =>
            updateNode(document, id, (node) => ({
              ...node,
              styles: {
                ...node.styles,
                [breakpoint]: {
                  ...node.styles[breakpoint],
                  [state]: { ...node.styles[breakpoint]?.[state], ...styles },
                },
              },
            })),
          ),
          { label: "Style", groupKey: `styles:${ids.join(",")}:${breakpoint}:${state}` },
        )
      },

      setLocked: (ids, locked) =>
        apply(
          forEach(ids, (document, id) =>
            updateNode(document, id, (node) => ({
              ...node,
              metadata: { ...node.metadata, locked },
            })),
          ),
          { label: locked ? "Lock" : "Unlock" },
        ),

      setHidden: (ids, hidden) =>
        apply(
          forEach(ids, (document, id) =>
            updateNode(document, id, (node) => ({
              ...node,
              visibility: { ...node.visibility, hidden },
            })),
          ),
          { label: hidden ? "Hide" : "Show" },
        ),

      rename: (id, name) =>
        apply(
          updateNode(get().document, id, (node) => ({
            ...node,
            metadata: { ...node.metadata, name },
          })),
          { label: "Rename", groupKey: `rename:${id}` },
        ),

      setTheme: (themeId) => {
        const before = snapshot()

        set((state) => ({
          ...state,
          document: { ...state.document, theme: { ...state.document.theme, themeId } },
          history:
            state.history.transactionDepth > 0
              ? { ...state.history, pending: state.history.pending ?? before, future: [] }
              : push(state.history, before, { label: "Theme", now: now() }),
          persistence: { ...state.persistence, status: "modified" },
        }))
      },

      // ── Selection ──────────────────────────────────────────────────────────
      select: (ids) =>
        set((state) => ({
          ...state,
          selection: {
            ...state.selection,
            ids: ids.filter((id) => state.document.nodes[id] !== undefined),
          },
        })),

      addToSelection: (id) =>
        set((state) =>
          state.document.nodes[id] === undefined || state.selection.ids.includes(id)
            ? state
            : { ...state, selection: { ...state.selection, ids: [...state.selection.ids, id] } },
        ),

      toggleSelection: (id) =>
        set((state) => {
          if (state.document.nodes[id] === undefined) return state

          const ids = state.selection.ids.includes(id)
            ? state.selection.ids.filter((current) => current !== id)
            : [...state.selection.ids, id]

          return { ...state, selection: { ...state.selection, ids } }
        }),

      clearSelection: () =>
        set((state) => ({ ...state, selection: { ...state.selection, ids: [] } })),

      selectParent: () =>
        set((state) => {
          const parentId = state.document.nodes[state.selection.ids[0] ?? ""]?.parentId

          return parentId === undefined || parentId === null
            ? state
            : { ...state, selection: { ...state.selection, ids: [parentId] } }
        }),

      selectFirstChild: () =>
        set((state) => {
          const child = state.document.nodes[state.selection.ids[0] ?? ""]?.children[0]

          return child === undefined
            ? state
            : { ...state, selection: { ...state.selection, ids: [child] } }
        }),

      selectSibling: (direction) =>
        set((state) => {
          const current = state.selection.ids[0]

          if (current === undefined) return state

          const order = siblingsOf(state.document, current)
          const next = order[order.indexOf(current) + direction]

          return next === undefined
            ? state
            : { ...state, selection: { ...state.selection, ids: [next] } }
        }),

      setEditingState: (editingState) =>
        set((state) => ({ ...state, selection: { ...state.selection, editingState } })),

      // ── History ────────────────────────────────────────────────────────────
      undo: () => {
        const state = get()
        const restored = undo(state.history, snapshot())

        if (restored === null) return false

        set({
          ...state,
          document: restored.entry.document,
          selection: { ...state.selection, ids: restored.entry.selection },
          history: restored.history,
          persistence: { ...state.persistence, status: "modified" },
        })

        return true
      },

      redo: () => {
        const state = get()
        const restored = redo(state.history, snapshot())

        if (restored === null) return false

        set({
          ...state,
          document: restored.entry.document,
          selection: { ...state.selection, ids: restored.entry.selection },
          history: restored.history,
          persistence: { ...state.persistence, status: "modified" },
        })

        return true
      },

      transact: (label, run) => {
        set((state) => ({
          ...state,
          history: { ...state.history, transactionDepth: state.history.transactionDepth + 1 },
        }))

        try {
          return run()
        } finally {
          set((state) => {
            const depth = state.history.transactionDepth - 1

            // Only the outermost commit writes history: a transaction inside a
            // transaction is one thing the person did, not two.
            if (depth > 0)
              return { ...state, history: { ...state.history, transactionDepth: depth } }

            const pending = state.history.pending

            return {
              ...state,
              history:
                pending === null
                  ? { ...state.history, transactionDepth: 0, pending: null }
                  : {
                      ...push(state.history, pending, { label, now: now() }),
                      transactionDepth: 0,
                      pending: null,
                    },
            }
          })
        }
      },

      // ── Clipboard ──────────────────────────────────────────────────────────
      copy: () => {
        const state = get()
        const id = state.selection.ids[0]

        if (id === undefined) return false

        const fragment = extract(state.document, id)

        if (fragment === null) return false

        const parentId = state.document.nodes[id]?.parentId ?? null
        const origin =
          parentId === null ? null : { parentId, index: siblingsOf(state.document, id).indexOf(id) }

        set({
          ...state,
          clipboard: {
            fragment,
            sourceProjectId: state.document.projectId,
            cut: false,
            origin,
          },
        })

        return true
      },

      cut: () => {
        const state = get()

        if (!state.copy()) return null

        const result = state.remove(state.selection.ids.slice(0, 1))

        if (result.ok) {
          set((current) => ({ ...current, clipboard: { ...current.clipboard, cut: true } }))
        }

        return result
      },

      paste: (parentId, index) => {
        const state = get()
        const fragment = state.clipboard.fragment

        if (fragment === null) return null

        const target = parentId ?? state.selection.ids[0] ?? state.document.root
        const copy = regenerateIds(
          fragment,
          new Set(Object.keys(state.document.nodes)),
          options.random,
        )

        return apply(
          insertNode(state.document, copy, target, index, treeOptions),
          { label: "Paste" },
          () => ({ selection: { ...get().selection, ids: [copy.rootId] } }),
        )
      },

      /**
       * Paste back where it came from.
       *
       * The clipboard remembers the parent the fragment was lifted out of and
       * its position among those siblings, which is what "in place" means: the
       * copy takes the slot the original had, and the original shifts down.
       * Landing it after the original would read more like duplicate, but then
       * a cut and an immediate paste-in-place would not put the node back where
       * it came from — and that is the case that has to be exact.
       *
       * Falls back to an ordinary paste when that parent is no longer there —
       * cut a section, delete its container, paste. Refusing would be correct
       * and useless; the copy goes where a plain paste would put it.
       */
      pasteInPlace: () => {
        const state = get()
        const origin = state.clipboard.origin

        if (origin === null || state.document.nodes[origin.parentId] === undefined) {
          return state.paste()
        }

        return state.paste(origin.parentId, origin.index)
      },

      pasteStyles: (ids) => {
        const state = get()
        const source = state.clipboard.fragment?.nodes[state.clipboard.fragment.rootId]
        const targets = ids ?? state.selection.ids

        if (source === undefined || targets.length === 0) return null

        return apply(
          forEach(targets, (document, id) =>
            updateNode(document, id, (node) => ({ ...node, styles: source.styles })),
          ),
          { label: "Paste styles" },
        )
      },

      setClipboard: (fragment, sourceProjectId = null) =>
        set((state) => ({
          ...state,
          // No origin: a fragment from somewhere else has no position here.
          clipboard: { fragment, sourceProjectId, cut: false, origin: null },
        })),

      // ── Viewport ───────────────────────────────────────────────────────────
      setBreakpoint: (breakpoint) =>
        set((state) => ({ ...state, viewport: { ...state.viewport, breakpoint } })),

      setZoom: (zoom) =>
        set((state) => ({
          ...state,
          viewport: {
            ...state.viewport,
            zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom)),
          },
        })),

      setPan: (pan) => set((state) => ({ ...state, viewport: { ...state.viewport, pan } })),

      setTransform: ({ zoom, pan }) =>
        set((state) => ({
          ...state,
          viewport: {
            ...state.viewport,
            zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom)),
            pan,
          },
        })),

      setMeasured: (measured) =>
        set((state) => ({ ...state, viewport: { ...state.viewport, measured } })),

      toggleViewportFlag: (flag) =>
        set((state) => ({
          ...state,
          viewport: { ...state.viewport, [flag]: !state.viewport[flag] },
        })),

      // ── Drag ───────────────────────────────────────────────────────────────
      beginDrag: (ids) =>
        set((state) => ({ ...state, drag: { ids, overId: null, position: null } })),

      setDropTarget: (overId, position) =>
        set((state) => ({ ...state, drag: { ...state.drag, overId, position } })),

      endDrag: () =>
        set((state) => ({ ...state, drag: { ids: [], overId: null, position: null } })),

      // ── Persistence ────────────────────────────────────────────────────────
      markSaving: () =>
        set((state) => ({ ...state, persistence: { ...state.persistence, status: "saving" } })),

      markSaved: (version, at) =>
        set((state) => ({
          ...state,
          persistence: {
            ...state.persistence,
            status: "saved",
            baseVersion: version,
            lastSavedAt: at ?? now(),
            error: null,
          },
        })),

      markSaveFailed: (message) =>
        set((state) => ({
          ...state,
          persistence: { ...state.persistence, status: "error", error: message },
        })),

      setCanEdit: (canEdit) =>
        set((state) => ({ ...state, persistence: { ...state.persistence, canEdit } })),
    }
  })
}

/** Every id under a node, for a caller deciding what a selection covers. */
export { subtreeIds }
