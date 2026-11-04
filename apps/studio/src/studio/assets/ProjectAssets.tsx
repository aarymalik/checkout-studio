"use client"

import type { LibraryAsset } from "@checkout-studio/api"
import type { AssetUrls } from "@checkout-studio/plugin-sdk"
import { createContext, useContext, useMemo } from "react"
import type { ReactElement, ReactNode } from "react"

/**
 * The project's assets: what the canvas draws with, and what a picker offers.
 *
 * ## Why a context rather than a prop
 *
 * The same reason the theme is one: the canvas is three components below the
 * shell, and threading a value through two that do not read it makes both
 * re-render when it changes. The canvas reads this directly.
 *
 * ## Why a map rather than a resolver
 *
 * The map is built on the server, where asset rows and the asset base URL are,
 * and crosses as data — a function is not something that crosses from a server
 * component to a client one. The closure the renderer wants is made here, once,
 * and memoised so the canvas is not handed a new function on every render.
 *
 * ## Two projections, one query
 *
 * The canvas needs URLs to draw with — `srcSet` and `sizes` among them. A
 * picker needs names, sizes and a thumbnail to show. Neither is a subset of
 * the other, so both are projected on the server from the same rows, and both
 * arrive here. Fetching them separately would be two queries answering one
 * question, and two answers that could disagree.
 *
 * ## What it does not do yet
 *
 * Change. Uploading refreshes the route, which re-renders the server component
 * and brings a new map, so a freshly uploaded asset is resolvable without a
 * reload. What it will need, when the picker lands, is for choosing an asset to
 * be instant — which it will be, because the picker chooses from a list the
 * browser already has and that list is this map's source.
 */

interface ProjectAssetsValue {
  /** Everything the project holds, newest first, as the library shows it. */
  assets: readonly LibraryAsset[]
  resolve: (assetId: string) => AssetUrls | null
}

const EMPTY: ProjectAssetsValue = { assets: [], resolve: () => null }

const ProjectAssetsContext = createContext<ProjectAssetsValue>(EMPTY)

/**
 * The canvas's asset resolver.
 *
 * Defaults to answering nothing, which is what the renderer does without one.
 * A gallery or a test that renders a canvas outside the shell gets that
 * default rather than an error, and an image with no source is a thing the
 * editor already draws.
 */
export function useAssetResolver(): (assetId: string) => AssetUrls | null {
  return useContext(ProjectAssetsContext).resolve
}

/**
 * The project's assets, for anything that offers a choice among them.
 *
 * Empty outside the provider, which is what a gallery or a test rendering one
 * control gets — and an empty library is a state the picker has to handle
 * anyway, because a project starts with one.
 */
export function useProjectAssets(): readonly LibraryAsset[] {
  return useContext(ProjectAssetsContext).assets
}

export function ProjectAssetsProvider({
  assets,
  urls,
  children,
}: {
  assets: readonly LibraryAsset[]
  urls: Readonly<Record<string, AssetUrls>>
  children: ReactNode
}): ReactElement {
  const value = useMemo(
    () => ({ assets, resolve: (assetId: string) => urls[assetId] ?? null }),
    [assets, urls],
  )

  return <ProjectAssetsContext.Provider value={value}>{children}</ProjectAssetsContext.Provider>
}
