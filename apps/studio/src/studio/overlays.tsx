"use client"

import { createContext, useContext, useMemo, useState, type ReactNode } from "react"

/**
 * Which overlay is open.
 *
 * One at a time, by construction: opening the palette closes the shortcut sheet
 * rather than stacking them, because two modal surfaces mean two things
 * competing for Escape and nothing being obviously dismissible.
 */
export type OverlayId = "palette" | "shortcuts"

interface OverlayContextValue {
  open: OverlayId | null
  show: (overlay: OverlayId) => void
  close: () => void
  toggle: (overlay: OverlayId) => void
}

const OverlayContext = createContext<OverlayContextValue | null>(null)

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<OverlayId | null>(null)

  const value = useMemo<OverlayContextValue>(
    () => ({
      open,
      show: (overlay) => setOpen(overlay),
      close: () => setOpen(null),
      // ⌘K while the palette is open closes it, which is what every product
      // that has a palette does.
      toggle: (overlay) => setOpen((current) => (current === overlay ? null : overlay)),
    }),
    [open],
  )

  return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>
}

export function useOverlays(): OverlayContextValue {
  const value = useContext(OverlayContext)

  if (value === null) {
    throw new Error("useOverlays must be used inside an <OverlayProvider>.")
  }

  return value
}
