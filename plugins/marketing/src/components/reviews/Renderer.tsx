import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

import { Stars, ratingText } from "../stars"

/**
 * Reviews.
 *
 * ## A summary, not a list
 *
 * One line: how well it is rated, out of how much, by how many, and where that
 * was said. The individual reviews are not here and are not coming — a
 * checkout page that rendered a hundred of them would be a checkout page
 * nobody finishes.
 *
 * ## Every number is the merchant's, and every number is written out
 *
 * The stars are decoration, so the rating appears as text beside them. The
 * count is formatted for the reader's locale, because "1204 reviews" is a
 * figure somebody has to parse and "1,204 reviews" is one they can read.
 */

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback
}

function number(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

export function ReviewsRenderer({ className, props }: ComponentRenderProps): ReactElement {
  const max = Math.max(number(props["max"], 5), 1)
  const rating = Math.min(Math.max(number(props["rating"], 0), 0), max)
  const count = Math.max(Math.trunc(number(props["count"], 0)), 0)
  const source = text(props["source"])

  let counted: string

  try {
    counted = new Intl.NumberFormat(text(props["locale"], "en-GB")).format(count)
  } catch {
    counted = String(count)
  }

  return (
    <div className={className}>
      <Stars rating={rating} max={max} />

      <p className="ck-reviews-line">
        <span className="ck-reviews-rating">{ratingText(rating, max)}</span>
        {count > 0 ? (
          <span className="ck-reviews-count">
            {`from ${counted} ${count === 1 ? "review" : "reviews"}`}
          </span>
        ) : null}
        {source !== "" ? <span className="ck-reviews-source">{`on ${source}`}</span> : null}
      </p>
    </div>
  )
}
