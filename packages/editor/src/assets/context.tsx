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
 * the inspector's asset control offers the same assets to choose from. That
 * control lives in this package, and this package may not import
 * `@checkout-studio/api` — they are the same layer — so a context in the
 * application could never reach it.
 *
 * It is also the right home on its own terms. "Which assets can this document
 * use" is a question any product built on this editor asks; what an asset
 * *is* on the server is Checkout Studio's business.
 */

/**
 * An asset as the editor needs it.
 *
 * Deliberately not the application's library row. That one carries a MIME
 * type, a byte count and an upload kind, and the kind is
 * `@checkout-studio/utils`' word — a package this one may not import. What is
 * left is what editing actually needs: something to draw with, something to
 * call it, and something to show beside the name in a list.
 */
export interface EditorAsset {
  /** The id a reference holds: `{ "$asset": id }`. */
  id: string
  /** What to call it in a list. The name it was uploaded under. */
  name: string
  /**
   * A small picture of it, or null when there is none to show.
   *
   * Null for a file that is not an image — a font, or a video no frame was
   * taken from. The picker then offers it by name alone, rather than drawing
   * an image that will not load.
   */
  previewUrl: string | null
  /** What a browser needs to draw it at full size. */
  urls: AssetUrls
}

interface AssetsValue {
  assets: readonly EditorAsset[]
  resolve: (assetId: string) => AssetUrls | null
}

/**
 * No assets, and a resolver that answers nothing.
 *
 * What a gallery, a test rendering one component, or an editor opened before
 * anything has been uploaded gets. An empty library is an ordinary state —
 * every project starts in it — so the default is that rather than an error.
 */
const EMPTY: AssetsValue = { assets: [], resolve: () => null }

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

/**
 * The assets there are to choose from, in the order they arrived.
 *
 * The inspector's asset control is the reader: a picker has to list what a
 * document *could* point at, which a resolver cannot answer — it only knows
 * what an id means once somebody has an id.
 */
export function useAssets(): readonly EditorAsset[] {
  return useContext(AssetsContext).assets
}

export function AssetsProvider({
  assets,
  children,
}: {
  /**
   * The project's assets, already projected for the browser.
   *
   * One list and not a list plus a map of URLs: two props keyed by the same
   * ids are two things that can disagree, and the picker and the canvas have
   * to be looking at the same library. The lookup the canvas needs is built
   * from it here, once, and memoised so the canvas is not handed a new
   * resolver on every render.
   */
  assets: readonly EditorAsset[]
  children: ReactNode
}): ReactElement {
  const value = useMemo(() => {
    const urls = new Map(assets.map((asset) => [asset.id, asset.urls] as const))

    return { assets, resolve: (assetId: string) => urls.get(assetId) ?? null }
  }, [assets])

  return <AssetsContext.Provider value={value}>{children}</AssetsContext.Provider>
}
