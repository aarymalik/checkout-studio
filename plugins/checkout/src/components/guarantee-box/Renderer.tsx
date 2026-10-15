import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

import { trustIcon } from "../icons"

/**
 * Guarantee Box.
 *
 * ## Static, like the badges beside it
 *
 * A promise the merchant wrote. Nothing to fetch, nothing to remember, so it
 * renders on the server and hydrates nothing.
 *
 * ## Its title is not a heading
 *
 * A guarantee is an aside — reassurance beside the thing being bought, not a
 * section of the document. Making its title an `<h3>` would put it in the
 * page's outline between the order and the payment, where somebody navigating
 * by headings would meet it as though it were a step. It is emphasised text
 * inside a labelled region instead, so it is findable without pretending to be
 * structure.
 */

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback
}

export function GuaranteeBoxRenderer({ className, props }: ComponentRenderProps): ReactElement {
  const title = text(props["title"], "30-day money-back guarantee")
  const description = text(props["description"], "")

  return (
    <aside className={className} aria-label={title}>
      <svg
        className="ck-guarantee-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {trustIcon(props["icon"]).map((path) => (
          <path key={path} d={path} />
        ))}
      </svg>

      <div className="ck-guarantee-body">
        <p className="ck-guarantee-title">{title}</p>
        {description !== "" ? <p className="ck-guarantee-text">{description}</p> : null}
      </div>
    </aside>
  )
}
