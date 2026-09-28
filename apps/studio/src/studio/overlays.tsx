"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

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

  /*
   * Where focus was before an overlay opened.
   *
   * Radix restores focus to a <DialogTrigger>, and these overlays have none:
   * ⌘K opens the palette from anywhere. Without this, dismissing it drops focus
   * to the body, and a keyboard user loses their place in the page — which is
   * the whole cost of having opened it by accident.
   */
  const previous = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open !== null) {
      previous.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null

      return
    }

    // Runs after the overlay has unmounted, so this is the last word on focus.
    const target = previous.current
    previous.current = null

    // Still in the document: a command that navigated away has taken its own
    // focus somewhere, and pulling it back would undo that.
    if (target !== null && target.isConnected) target.focus()
  }, [open])

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
