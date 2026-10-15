import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

/**
 * Progress Bar.
 *
 * ## `role="progressbar"`, not `<progress>`
 *
 * The element is semantically right and practically unusable: every browser
 * draws it differently and the parts that can be styled are vendor-prefixed
 * pseudo-elements that no design system can reach. The role carries the same
 * meaning to a screen reader — "progress bar, 60 percent" — and leaves the
 * drawing to CSS the theme controls.
 *
 * ## It is told, not calculated
 *
 * `aria-valuenow`, `aria-valuemin` and `aria-valuemax` are the merchant's
 * numbers. The width is the one thing worked out here, and it is a percentage
 * of the track rather than an amount of anything.
 *
 * ## Static
 *
 * Nothing moves on its own. The width transition exists for when a value
 * changes, which on a checkout means a page that re-renders with a new one —
 * and it collapses to nothing for a reader who asked for less motion, because
 * the duration is a theme token.
 */

function number(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback
}

export function ProgressBarRenderer({ className, props }: ComponentRenderProps): ReactElement {
  const max = Math.max(number(props["max"], 100), 1)
  /*
   * Clamped. A value above the maximum would draw a bar wider than its track,
   * and a negative one would draw it backwards out of the left-hand edge.
   */
  const value = Math.min(Math.max(number(props["value"], 0), 0), max)
  const label = text(props["label"], "Progress")
  const percent = (value / max) * 100

  return (
    <div className={className}>
      <div
        className="ck-progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div className="ck-progress-fill" style={{ width: `${String(percent)}%` }} />
      </div>

      {props["showLabel"] !== false ? <p className="ck-progress-label">{label}</p> : null}
    </div>
  )
}
