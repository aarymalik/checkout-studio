"use client"

import type { AssetUrls } from "@checkout-studio/plugin-sdk"
import { createContext, useContext, useMemo } from "react"
import type { ReactElement, ReactNode } from "react"

/**
 * The assets a document may refer to.
 *
 * ## Why the editor owns this and not the application
 *
 * The canvas resolves `{ "$asset": "ast_9f2a" }` into URLs before drawing, and
 * the inspector's asset control will offer the same assets to choose from.
 * That control lives in this package, and this package may not import
 * `@checkout-studio/api` — they are the same layer — so a context in the
 * application could never reach it.
 *
 * It is also the right home on its own terms. "Which assets can this document
 * use" is a question any product built on this editor asks; what an asset
 * *is* on the server is Checkout Studio's business.
 */

interface AssetsValue {
  resolve: (assetId: string) => AssetUrls | null
}

/**
 * A resolver that answers nothing.
 *
 * What a gallery, a test rendering one component, or an editor opened before
 * anything has been uploaded gets. An empty library is an ordinary state —
 * every project starts in it — so the default is that rather than an error.
 */
const EMPTY: AssetsValue = { resolve: () => null }

const AssetsContext = createContext<AssetsValue>(EMPTY)

/**
 * Turns a reference into the URLs that draw it, or null.
 *
 * Null for an asset that is gone — deleted after a page referenced it. The
 * renderer reports it as `asset-missing` and draws the rest, because one
 * missing picture should not take down a checkout.
 */
export function useAssetResolver(): (assetId: string) => AssetUrls | null {
  return useContext(AssetsContext).resolve
}

export function AssetsProvider({
  urls,
  children,
}: {
  /**
   * The project's assets keyed by id, with what a browser needs to fetch them.
   *
   * A map rather than a resolver, because a function is not something that
   * crosses from a server component to a client one. The closure is made
   * here, once, and memoised so the canvas is not handed a new one on every
   * render.
   */
  urls: Readonly<Record<string, AssetUrls>>
  children: ReactNode
}): ReactElement {
  const value = useMemo(() => ({ resolve: (assetId: string) => urls[assetId] ?? null }), [urls])

  return <AssetsContext.Provider value={value}>{children}</AssetsContext.Provider>
}
