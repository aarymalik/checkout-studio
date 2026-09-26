import type { ComponentPropsWithoutRef } from "react"
import { cn } from "../lib/cn"

/**
 * An indeterminate progress indicator.
 *
 * `role="status"` with an accessible name, so a screen reader announces that
 * work is happening rather than leaving a silent pause. `data-essential-motion`
 * keeps it turning when a reader asks for reduced motion: the rotation is the
 * only signal that anything is in progress, and a frozen spinner reads as a
 * broken interface.
 */
export interface SpinnerProps extends ComponentPropsWithoutRef<"span"> {
  /** What is being waited for. Announced, not shown. */
  label?: string
  size?: "sm" | "md" | "lg"
}

const SIZES = {
  sm: "size-3",
  md: "size-4",
  lg: "size-5",
} as const

export function Spinner({ label = "Loading", size = "md", className, ...props }: SpinnerProps) {
  return (
    <span role="status" className={cn("inline-flex items-center", className)} {...props}>
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 24 24"
        data-essential-motion
        className={cn("animate-spinner", SIZES[size])}
      >
        {/* A ring with a gap: the gap is what makes rotation visible. */}
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="44"
          strokeDashoffset="14"
          opacity="0.9"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  )
}
