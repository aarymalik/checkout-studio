"use client"

import type { AssetUrls } from "@checkout-studio/plugin-sdk"
import { createContext, useContext, useMemo } from "react"
import type { ReactElement, ReactNode } from "react"

/**
 * The URLs for the project's assets, for the canvas to resolve references with.
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
 * ## What it does not do yet
 *
 * Change. Uploading refreshes the route, which re-renders the server component
 * and brings a new map, so a freshly uploaded asset is resolvable without a
 * reload. What it will need, when the picker lands, is for choosing an asset to
 * be instant — which it will be, because the picker chooses from a list the
 * browser already has and that list is this map's source.
 */

const ProjectAssetsContext = createContext<(assetId: string) => AssetUrls | null>(() => null)

/**
 * The canvas's asset resolver.
 *
 * Defaults to answering nothing, which is what the renderer does without one.
 * A gallery or a test that renders a canvas outside the shell gets that
 * default rather than an error, and an image with no source is a thing the
 * editor already draws.
 */
export function useAssetResolver(): (assetId: string) => AssetUrls | null {
  return useContext(ProjectAssetsContext)
}

export function ProjectAssetsProvider({
  urls,
  children,
}: {
  urls: Readonly<Record<string, AssetUrls>>
  children: ReactNode
}): ReactElement {
  const resolve = useMemo(() => (assetId: string) => urls[assetId] ?? null, [urls])

  return <ProjectAssetsContext.Provider value={resolve}>{children}</ProjectAssetsContext.Provider>
}
