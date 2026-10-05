"use client"

import { createContext, useContext, useMemo, useRef, type ReactNode } from "react"
import { useStore } from "zustand"
import type { CheckoutSchema } from "@checkout-studio/schema"

import {
  createEditorStore,
  type CreateStoreOptions,
  type EditorStore,
  type EditorStoreApi,
} from "./store"

/**
 * The store, made available to React.
 *
 * One store per editor, created once and kept for the life of the mount. A
 * store rebuilt on re-render would lose history, selection and everything else
 * that is not the document — and it would do it silently.
 *
 * Components subscribe through a selector rather than to the whole store, so
 * updating one node re-renders what shows that node and nothing else.
 */

const StoreContext = createContext<EditorStoreApi | null>(null)

export interface EditorProviderProps extends Omit<CreateStoreOptions, "document"> {
  children: ReactNode
  document: CheckoutSchema
}

export function EditorProvider({ children, ...options }: EditorProviderProps) {
  // A ref rather than useMemo: useMemo is a performance hint and React may
  // discard it, which here would mean discarding somebody's undo history.
  const store = useRef<EditorStoreApi>(null)

  store.current ??= createEditorStore(options)

  return <StoreContext.Provider value={store.current}>{children}</StoreContext.Provider>
}

/** The store itself, for a caller that needs to act rather than to render. */
export function useEditorStoreApi(): EditorStoreApi {
  const store = useContext(StoreContext)

  if (store === null) throw new Error("useEditorStore must be used inside an <EditorProvider>.")

  return store
}

/**
 * The store if there is one.
 *
 * For the surfaces that outlive a document. Commands and the shell are built
 * once for the application and have to exist with no page open — the throwing
 * version is right for a panel that is meaningless without one, and wrong for a
 * registry that has to be able to say "not available yet".
 */
export function useOptionalEditorStoreApi(): EditorStoreApi | null {
  return useContext(StoreContext)
}

/**
 * Subscribe to part of the store.
 *
 * The selector is what keeps a re-render local. Subscribing to the whole store
 * re-renders the canvas whenever anything at all changes, which is the failure
 * docs/state-management.md § Re-render Strategy is about.
 */
export function useEditorStore<T>(selector: (state: EditorStore) => T): T {
  return useStore(useEditorStoreApi(), selector)
}

/** The editor's actions. Stable, so a component that only acts never re-renders. */
export function useEditorActions(): EditorStoreApi["getState"] {
  const store = useEditorStoreApi()

  return useMemo(() => store.getState, [store])
}
