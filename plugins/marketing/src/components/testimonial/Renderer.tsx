import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

import { Stars, ratingText } from "../stars"

/**
 * Testimonial.
 *
 * ## A figure around a blockquote
 *
 * `<figure>` holding a `<blockquote>` and a `<figcaption>` is what HTML has
 * for a quotation and the person it came from. A stack of `<div>`s would read
 * as three unrelated paragraphs, and the attribution would float free of the
 * words it belongs to.
 *
 * ## The rating is said, not shown
 *
 * The stars are `aria-hidden` — a row of graphics read aloud is nothing — so
 * the figure goes into the caption in words. A testimonial with no rating
 * draws no stars rather than five empty ones, because an empty row is a bad
 * review rather than an absent one.
 */

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback
}

function rating(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null
}

export function TestimonialRenderer({ className, props }: ComponentRenderProps): ReactElement {
  const quote = text(props["quote"])
  const name = text(props["name"])
  const role = text(props["role"])
  const company = text(props["company"])
  const avatar = text(props["avatar"])
  const score = rating(props["rating"])

  // Name, then role at company — joined only where both halves exist, so
  // nobody is attributed as "Founder at" or " at Acme".
  const attribution = [role, company].filter((part) => part !== "").join(" at ")

  return (
    <figure className={className}>
      {score !== null ? (
        <p className="ck-testimonial-rating">
          <Stars rating={score} />
          <span className="ck-testimonial-said">{`Rated ${ratingText(score)}`}</span>
        </p>
      ) : null}

      <blockquote>{quote}</blockquote>

      <figcaption>
        {avatar !== "" ? <img src={avatar} alt={text(props["avatarAlt"])} /> : null}

        <span className="ck-testimonial-who">
          <span className="ck-testimonial-name">{name}</span>
          {attribution !== "" ? <span className="ck-testimonial-role">{attribution}</span> : null}
        </span>
      </figcaption>
    </figure>
  )
}
