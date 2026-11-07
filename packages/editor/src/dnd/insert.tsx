"use client"

import { createContext, useContext, useMemo } from "react"
import type { ReactElement, ReactNode } from "react"

import { useEditorStore, useEditorStoreApi } from "../state/context"
import type { Insertion } from "../state/types"

/**
 * Asking for something to be inserted, from a panel that may not have a store.
 *
 * ## The rule this exists to keep
 *
 * A project with no page open has no store: "a store built around a document
 * that does not exist would have to invent one, and every panel reading it
 * would show somebody a page they never created." The shell says so where it
 * decides, and the panels it supplies itself — the component library, the
 * layers tree — are only rendered when there is one.
 *
 * The media library is not one of those. It is supplied by the page, because
 * what it lists is the project's assets and that is a server query, so it
 * renders whether or not a page is open. The moment it reached for the store
 * to start a drag, opening a project with no page threw during server
 * rendering and took the whole screen with it.
 *
 * ## So the capability arrives instead of being fetched
 *
 * Inside the store this provides a function; outside it there is none, and a
 * panel with no function offers no drag. Which is right on its own terms as
 * well as structurally: with no page open there is no canvas to drag onto.
 *
 * Null also when the reader may not write, so a panel never has to ask that
 * question separately — a second editor holding the page gets a library it
 * can look at and copy from, and cannot put anything on a page with.
 */
export type InsertRequest = (insertion: Insertion) => void

const InsertContext = createContext<InsertRequest | null>(null)

export function InsertProvider({ children }: { children: ReactNode }): ReactElement {
  const store = useEditorStoreApi()
  const canEdit = useEditorStore((state) => state.persistence.canEdit)

  const request = useMemo<InsertRequest | null>(
    () =>
      canEdit
        ? (insertion) => {
            store.getState().setInserting(insertion)
          }
        : null,
    [store, canEdit],
  )

  return <InsertContext.Provider value={request}>{children}</InsertContext.Provider>
}

/** A way to start an insert drag, or null when there is nowhere to drag to. */
export function useInsertRequest(): InsertRequest | null {
  return useContext(InsertContext)
}
