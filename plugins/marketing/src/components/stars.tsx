import type { ReactElement } from "react"

/**
 * A rating, drawn.
 *
 * ## Why it is an SVG and not "★★★★★"
 *
 * The character is a font's idea of a star, and every platform has a different
 * one — a visual baseline taken on macOS would never match the same page drawn
 * on Linux. A path is the same five points everywhere.
 *
 * ## Decoration, always
 *
 * The stars carry no meaning a screen reader can use: four-point-eight read as
 * a row of graphics is nothing at all. They are `aria-hidden`, and every
 * component that draws them writes the figure out in words beside them.
 *
 * ## How a fraction is shown
 *
 * A second row of filled stars, clipped to a share of the row's width. The
 * share includes the gaps between stars, so 4.8 of 5 fills about 76% of the
 * last star rather than exactly 80% — six-tenths of a pixel at the size these
 * are drawn, beside a figure that is always written out in full.
 */

const STAR = "m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z"

const POSITIONS = [0, 1, 2, 3, 4]

function row(filled: boolean): ReactElement {
  return (
    <span className="ck-stars-track">
      {POSITIONS.map((index) => (
        <svg
          key={index}
          viewBox="0 0 24 24"
          fill={filled ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
        >
          <path d={STAR} />
        </svg>
      ))}
    </span>
  )
}

export interface StarsProps {
  rating: number
  max?: number
}

export function Stars({ rating, max = 5 }: StarsProps): ReactElement {
  const share = Math.min(Math.max(rating / Math.max(max, 1), 0), 1) * 100

  return (
    <span className="ck-stars" aria-hidden>
      {row(false)}
      <span className="ck-stars-clip" style={{ width: `${String(share)}%` }}>
        {row(true)}
      </span>
    </span>
  )
}

/** The figure, in the words that go beside the stars. */
export function ratingText(rating: number, max = 5): string {
  const shown = Number.isInteger(rating) ? String(rating) : rating.toFixed(1)

  return `${shown} out of ${String(max)}`
}

/** Shared by both components that draw a rating. */
export const STAR_STYLES = {
  ".ck-stars": { position: "relative", display: "inline-block", lineHeight: "0" },

  ".ck-stars-track": { display: "flex", gap: "{spacing.1}", width: "max-content" },

  ".ck-stars-clip": { position: "absolute", top: "0", left: "0", overflow: "hidden" },

  svg: { width: "{spacing.4}", height: "{spacing.4}", color: "{colors.warning}" },
} as const
