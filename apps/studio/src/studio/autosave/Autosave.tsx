"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
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

import { createDraftWriter, type DraftWriter } from "./draft-writer"

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
  /** The document the server last agreed to, which a conflict is described against. */
  base: () => CheckoutSchema
  /**
   * The unresolved conflict, if there is one.
   *
   * A count rather than a boolean, so a second conflict reopens a prompt the
   * person dismissed instead of being swallowed as "already conflicted".
   */
  conflict: { message: string; count: number } | null
  /**
   * Ask for the prompt again.
   *
   * The conflict stays set until it is resolved, so putting the prompt aside
   * loses nothing — this is how the status bar brings it back.
   */
  reopenConflict: () => void
  /**
   * Adopt a resolved document.
   *
   * Called once the server has been made to agree with one side. The writer has
   * to start again from that document or its next patch describes changes
   * against a version that never existed.
   */
  adopt: (document: CheckoutSchema) => void
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

  const [conflict, setConflict] = useState<{ message: string; count: number } | null>(null)

  /*
   * Built once, in a ref rather than a memo.
   *
   * useMemo is a performance hint React may discard, and discarding this would
   * discard its record of what the server already has — so the next save would
   * be a patch computed against a version the server never held.
   *
   * The writer is kept beside the engine rather than in its own ref: they are
   * built together, and the engine closes over the writer directly so a save
   * never has to check whether one exists.
   */
  const running = useRef<{ engine: AutosaveEngine; writer: DraftWriter }>(null)

  running.current ??= (() => {
    const writer = createDraftWriter(document)

    const engine = createAutosave({
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
        logger.warn("autosave.conflict", { pageId: document.pageId, message })

        // The engine has already stopped writing. This raises the prompt that
        // lets somebody choose which document survives.
        setConflict((current) => ({ message, count: (current?.count ?? 0) + 1 }))
      },
    })

    return { engine, writer }
  })()

  useEffect(() => {
    const autosave = running.current?.engine

    if (autosave === undefined) return

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
      void running.current?.engine.flush().catch((thrown: unknown) => {
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

  const adopt = useCallback((resolved: CheckoutSchema) => {
    running.current?.writer.reset(resolved)
    setConflict(null)
  }, [])

  const control = useMemo<AutosaveControl>(
    () => ({
      conflict,
      adopt,
      reopenConflict: () =>
        setConflict((current) =>
          current === null ? null : { ...current, count: current.count + 1 },
        ),
      base: () => {
        const draft = running.current

        if (draft === null) throw new Error("Autosave has no writer.")

        return draft.writer.base()
      },
      flush: async () => {
        try {
          await running.current?.engine.flush()
        } catch (thrown: unknown) {
          // Swallowed rather than thrown on: a caller flushing before it gives
          // up the lock has to carry on doing that either way, and the engine
          // has already recorded the failure for the status bar.
          logger.warn("autosave.flush.failed", {}, normalizeError(thrown))
        }
      },
    }),
    [conflict, adopt],
  )

  return <AutosaveContext.Provider value={control}>{children}</AutosaveContext.Provider>
}
