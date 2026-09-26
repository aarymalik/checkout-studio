import { useCallback, useEffect, useRef } from "react"
import { cn } from "../lib/cn"

/**
 * The draggable divider between two panels.
 *
 * `role="separator"` with a value and a range, which is what makes it operable
 * by keyboard: arrow keys nudge it, Home and End take it to its limits, and
 * `aria-valuenow` tells a reader where it is. A divider that only responds to a
 * drag is a layout nobody can adjust without a mouse.
 *
 * See docs/design-system.md § Panels: resizable, collapsible, persistent width.
 */
export interface SplitterProps {
  /** What is being resized: "Left panel". Announced. */
  label: string
  /** The current size in pixels of the panel this divider sizes. */
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  /** Which edge the panel sits on, which decides the direction of travel. */
  side?: "start" | "end"
  /** Pixels moved per arrow key press. */
  step?: number
  orientation?: "vertical" | "horizontal"
}

export function Splitter({
  label,
  value,
  min,
  max,
  onChange,
  side = "start",
  step = 16,
  orientation = "vertical",
}: SplitterProps) {
  const dragging = useRef(false)
  const clamp = useCallback((next: number) => Math.min(max, Math.max(min, next)), [min, max])

  useEffect(() => {
    if (typeof window === "undefined") return

    function onMove(event: PointerEvent): void {
      if (!dragging.current) return

      const position = orientation === "vertical" ? event.clientX : event.clientY
      // A panel on the far edge grows as the pointer moves towards the centre,
      // so its size is measured from the opposite side of the window.
      const extent = orientation === "vertical" ? window.innerWidth : window.innerHeight
      onChange(clamp(side === "start" ? position : extent - position))
    }

    function onUp(): void {
      dragging.current = false
    }

    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)

    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
  }, [clamp, onChange, orientation, side])

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={orientation}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      onPointerDown={() => {
        dragging.current = true
      }}
      onKeyDown={(event) => {
        // Both axes respond, because which arrow key is "bigger" depends on the
        // reader's mental model rather than on the divider's orientation.
        const grow = event.key === "ArrowRight" || event.key === "ArrowDown"
        const shrink = event.key === "ArrowLeft" || event.key === "ArrowUp"

        if (grow || shrink) {
          event.preventDefault()
          onChange(clamp(value + (grow ? step : -step)))
        } else if (event.key === "Home") {
          event.preventDefault()
          onChange(min)
        } else if (event.key === "End") {
          event.preventDefault()
          onChange(max)
        }
      }}
      className={cn(
        "group relative shrink-0",
        orientation === "vertical" ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize",
        "bg-border",
        "transition-colors duration-fast ease-standard",
        "hover:bg-primary",
        "outline-none",
      )}
    />
  )
}
