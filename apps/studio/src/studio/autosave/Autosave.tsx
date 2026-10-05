"use client"

import { createContext, useContext, useEffect, useMemo, useRef } from "react"
import type { ReactNode } from "react"
import {
  createAutosave,
  createDurableQueue,
  useEditorStoreApi,
  type Autosave as AutosaveEngine,
} from "@checkout-studio/editor"
import { logger } from "@checkout-studio/observability"
import { normalizeError } from "@checkout-studio/utils"
import type { CheckoutSchema } from "@checkout-studio/schema"

import { createDraftWriter } from "./draft-writer"

/**
 * Autosave, running.
 *
 * Renders nothing. It exists because the engine has to be built once per open
 * page and torn down with it, and a component is the thing React already
 * guarantees that for — a hook called from the shell would be the same code
 * with its lifecycle spread across a component that does other things too.
 *
 * Mounted inside the editor's provider, so it only exists when there is a page
 * and a store. Without a page there is nothing to save.
 *
 * It renders its children and offers them `flush`, because losing the edit lock
 * has to persist the work before going read-only — and the only thing that can
 * do that is the engine this owns.
 *
 * See docs/history-versioning.md § Autosave Rules.
 */

export interface AutosaveControl {
  /** Save now, if anything is unsaved. */
  flush: () => Promise<void>
}

const AutosaveContext = createContext<AutosaveControl | null>(null)

/**
 * The running autosave.
 *
 * Null outside the provider rather than throwing: a surface that would like to
 * flush but can live without it should not have to know whether a page is open.
 */
export function useAutosave(): AutosaveControl | null {
  return useContext(AutosaveContext)
}

export function Autosave({
  document,
  children,
}: {
  document: CheckoutSchema
  children?: ReactNode
}): ReactNode {
  const store = useEditorStoreApi()

  /*
   * Built once, in a ref rather than a memo.
   *
   * useMemo is a performance hint React may discard, and discarding this would
   * discard its record of what the server already has — so the next save would
   * be a patch computed against a version the server never held.
   *
   * The writer is built inside, so the engine closes over it directly: holding
   * each in its own ref would mean a null check on every save for a state that
   * cannot happen.
   */
  const running = useRef<AutosaveEngine>(null)

  running.current ??= (() => {
    const writer = createDraftWriter(document)

    return createAutosave({
      store,
      pageId: document.pageId,
      save: (request) => writer.write(request),
      queue: createDurableQueue(
        // Absent in a private window with storage blocked, and during the
        // server render that precedes hydration.
        typeof indexedDB === "undefined" ? undefined : indexedDB,
        (error) => logger.warn("autosave.queue.degraded", {}, normalizeError(error)),
      ),
      onConflict: (message) => {
        // The prompt that lets somebody choose which version survives is still
        // to come. Until then the engine has stopped writing, the status bar
        // reports it, and nothing of either side has been overwritten.
        logger.warn("autosave.conflict", { pageId: document.pageId, message })
      },
    })
  })()

  useEffect(() => {
    const autosave = running.current

    if (autosave === null) return

    const stop = autosave.start()

    // What a previous session could not send, before anything new is written,
    // so an older document never lands on top of a newer one.
    void autosave.replay().catch((thrown: unknown) => {
      logger.warn("autosave.replay.failed", {}, normalizeError(thrown))
    })

    return stop
  }, [])

  /*
   * Save before the page goes away.
   *
   * `pagehide` rather than `beforeunload`: it fires on mobile and for a
   * back-forward cache eviction, where `beforeunload` does not, and it does not
   * disqualify the page from that cache. `visibilitychange` covers switching
   * tab or app, which on iOS is the last callback a page reliably receives.
   *
   * Best-effort by nature — the request may not finish. This is not the
   * durability guarantee; the queue is. It is what keeps the ordinary case of
   * closing a tab from waiting out the debounce first.
   */
  useEffect(() => {
    const flush = (): void => {
      void running.current?.flush().catch((thrown: unknown) => {
        logger.warn("autosave.flush.failed", {}, normalizeError(thrown))
      })
    }

    const onVisibilityChange = (): void => {
      if (window.document.visibilityState === "hidden") flush()
    }

    window.addEventListener("pagehide", flush)
    window.document.addEventListener("visibilitychange", onVisibilityChange)

    return () => {
      window.removeEventListener("pagehide", flush)
      window.document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [])

  const control = useMemo<AutosaveControl>(
    () => ({
      flush: async () => {
        try {
          await running.current?.flush()
        } catch (thrown: unknown) {
          // Swallowed rather than thrown on: a caller flushing before it gives
          // up the lock has to carry on doing that either way, and the engine
          // has already recorded the failure for the status bar.
          logger.warn("autosave.flush.failed", {}, normalizeError(thrown))
        }
      },
    }),
    [],
  )

  return <AutosaveContext.Provider value={control}>{children}</AutosaveContext.Provider>
}
