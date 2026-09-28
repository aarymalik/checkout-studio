"use client"

import { createContext, useContext, type ReactNode } from "react"
import type { PaletteRegistry } from "@checkout-studio/editor"

/**
 * The palette's sources.
 *
 * Separate from the command registry, because the palette searches more than
 * commands: pages, components and nodes register their own sources as those
 * features arrive. A filter with no source behind it is not offered.
 */
const PaletteContext = createContext<PaletteRegistry | null>(null)

export function PaletteScope({
  palette,
  children,
}: {
  palette: PaletteRegistry
  children: ReactNode
}) {
  return <PaletteContext.Provider value={palette}>{children}</PaletteContext.Provider>
}

export function usePalette(): PaletteRegistry {
  const value = useContext(PaletteContext)

  if (value === null) {
    throw new Error("usePalette must be used inside <StudioProviders>.")
  }

  return value
}
