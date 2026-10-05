import { serialize, type CheckoutSchema } from "@checkout-studio/schema"

import type { SaveQueue } from "./queue"
import type { EditorStoreApi } from "./store"

/**
 * Autosave.
 *
 * Five seconds after the last change, and at most thirty seconds apart while
 * somebody keeps typing. The debounce keeps a burst of edits from becoming a
 * burst of requests; the ceiling keeps a person who never pauses from going
 * half an hour without a save.
 *
 * Only the document is watched. Selecting a node, zooming, or opening a panel
 * changes the store and must not write anything — docs/history-versioning.md
 * § Autosave Rules lists exactly that.
 *
 * A failed save goes to a durable queue and is retried with backoff. It is not
 * dropped, and it is not lost by closing the tab.
 */

export const DEBOUNCE_MS = 5_000
export const MAXIMUM_WAIT_MS = 30_000
export const RETRY_BASE_MS = 1_000
export const RETRY_CEILING_MS = 60_000

export interface SaveRequest {
  pageId: string
  document: CheckoutSchema
  baseVersion: number
}

export type SaveOutcome =
  | { ok: true; version: number }
  /** The version moved on. The document must not be written again unprompted. */
  | { ok: false; reason: "conflict"; message: string }
  /** Offline, a 500, a timeout. Queue it and try again. */
  | { ok: false; reason: "transient"; message: string }
  /**
   * The server refused the write itself: a malformed patch, or one that would
   * produce something that is not a page.
   *
   * Separate from transient because retrying sends the same refusal, and a
   * sixty-second loop against a server that will never accept the write is
   * worse than stopping and saying so. It means a bug on our side rather than
   * a condition that passes.
   */
  | { ok: false; reason: "rejected"; message: string }

export interface AutosaveOptions {
  store: EditorStoreApi
  pageId: string
  save: (request: SaveRequest) => Promise<SaveOutcome>
  queue: SaveQueue
  /** Called when the server says the draft moved on. The prompt is Phase 7. */
  onConflict?: (message: string) => void
  now?: () => number
  debounceMs?: number
  maximumWaitMs?: number
}

export interface Autosave {
  /** Start watching. Returns a function that stops and cancels pending work. */
  start: () => () => void
  /** Save now, if anything is unsaved. Publish, close and manual save use this. */
  flush: () => Promise<void>
  /** Send whatever a previous session left behind, oldest first. */
  replay: () => Promise<void>
  /** Whether a save is in flight. */
  isSaving: () => boolean
}

export function createAutosave(options: AutosaveOptions): Autosave {
  const {
    store,
    pageId,
    save,
    queue,
    onConflict,
    now = Date.now,
    debounceMs = DEBOUNCE_MS,
    maximumWaitMs = MAXIMUM_WAIT_MS,
  } = options

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let ceilingTimer: ReturnType<typeof setTimeout> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let inFlight: Promise<void> | null = null
  let failures = 0
  /** The document as last written. Compared by bytes, so a no-op writes nothing. */
  let savedBytes: string | null = null

  function clearTimers(): void {
    if (debounceTimer !== null) clearTimeout(debounceTimer)
    if (ceilingTimer !== null) clearTimeout(ceilingTimer)
    if (retryTimer !== null) clearTimeout(retryTimer)
    debounceTimer = null
    ceilingTimer = null
    retryTimer = null
  }

  /**
   * Write the current document.
   *
   * Never runs twice at once: a second call while one is in flight returns the
   * first, so a flush during a debounce does not produce two writes of the same
   * thing against the same version.
   */
  function write(): Promise<void> {
    if (inFlight !== null) return inFlight

    const state = store.getState()

    if (!state.persistence.canEdit) return Promise.resolve()

    const document = state.document
    const bytes = serialize(document)

    // Nothing changed. This is the ordinary case on a page somebody is reading
    // rather than editing, and it must not produce a request.
    if (bytes === savedBytes) return Promise.resolve()

    clearTimers()
    store.getState().markSaving()

    inFlight = save({ pageId, document, baseVersion: state.persistence.baseVersion })
      .then(async (outcome) => {
        if (outcome.ok) {
          savedBytes = bytes
          failures = 0
          store.getState().markSaved(outcome.version)
          await queue.clear(pageId)

          return
        }

        if (outcome.reason === "conflict") {
          // A stale write must not be retried: it would fail identically until
          // somebody chooses which version survives.
          store.getState().markSaveFailed(outcome.message)
          onConflict?.(outcome.message)

          return
        }

        if (outcome.reason === "rejected") {
          store.getState().markSaveFailed(outcome.message)

          return
        }

        failures += 1
        store.getState().markSaveFailed(outcome.message)

        await queue.add({
          pageId,
          document: bytes,
          baseVersion: state.persistence.baseVersion,
          queuedAt: now(),
        })

        scheduleRetry()
      })
      .finally(() => {
        inFlight = null
      })

    return inFlight
  }

  /** Exponential, capped. A server that is down should not be asked every second. */
  function scheduleRetry(): void {
    const delay = Math.min(RETRY_BASE_MS * 2 ** (failures - 1), RETRY_CEILING_MS)

    retryTimer = setTimeout(() => {
      retryTimer = null
      void write()
    }, delay)
  }

  function schedule(): void {
    if (debounceTimer !== null) clearTimeout(debounceTimer)

    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void write()
    }, debounceMs)

    // Set once per unsaved run, not per keystroke: otherwise continuous typing
    // pushes the ceiling out forever and it never fires.
    if (ceilingTimer === null) {
      ceilingTimer = setTimeout(() => {
        ceilingTimer = null
        void write()
      }, maximumWaitMs)
    }
  }

  return {
    start: () => {
      savedBytes = serialize(store.getState().document)

      const unsubscribe = store.subscribe((state, previous) => {
        // The document, and only the document. Selection, viewport, history and
        // panel state all change the store and none of them are the page.
        if (state.document !== previous.document) schedule()
      })

      return () => {
        unsubscribe()
        clearTimers()
      }
    },

    flush: async () => {
      clearTimers()
      await write()
    },

    /**
     * Send what a previous session could not.
     *
     * Oldest first, and each against the version it was written for — so the
     * server rejects one that has already been applied rather than applying it
     * twice.
     */
    replay: async () => {
      for (const entry of await queue.all(pageId)) {
        const parsed = JSON.parse(entry.document) as CheckoutSchema
        const outcome = await save({
          pageId,
          document: parsed,
          baseVersion: entry.baseVersion,
        })

        // Stop, and keep the entry: the next attempt is the same attempt, and
        // sending a later entry first would put an older document on top of a
        // newer one.
        if (!outcome.ok && outcome.reason === "transient") return

        /*
         * Drop it, and carry on with the rest.
         *
         * A conflict means the server has moved past this entry, which is the
         * same as it having been applied. A rejection means the server will
         * never accept it. Either way there is nothing left to send, and
         * keeping it would block every entry behind it forever.
         */
        await queue.remove(entry.id)

        if (outcome.ok) {
          savedBytes = entry.document
          store.getState().markSaved(outcome.version)
        }
      }
    },

    isSaving: () => inFlight !== null,
  }
}
