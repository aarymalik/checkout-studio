import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

import { readItems } from "./items"

/**
 * FAQ.
 *
 * ## `<details>`, so it works before JavaScript does
 *
 * Opening and closing, keyboard operation, the announcement that a thing is
 * expanded or collapsed, and the browser's own find-in-page opening the right
 * answer — all of it is the element's, and all of it is free. A pair of divs
 * with a click handler would need `aria-expanded`, `aria-controls`, a key
 * handler, a focus ring and a tab stop, and would still ship JavaScript to a
 * page whose budget is spent on taking a payment.
 *
 * So this component is static. A checkout downloads nothing for it.
 *
 * ## The chevron, and where it does not turn
 *
 * It rotates through `details:open`, which is a pseudo-class and therefore
 * survives the renderer's selector grammar. The universal spelling is
 * `details[open]`, and attribute selectors are dropped — they are the one
 * construct with a quoting problem inside them, and widening the grammar for a
 * chevron would widen it for the merchant CSS that Code Block accepts.
 *
 * On a browser too old for `:open` the chevron sits still and everything else
 * works. That is the right way round.
 *
 * ## Not animated
 *
 * docs/component-library.md lists Animation. A `<details>` cannot be animated
 * open without scripting its height, which would make a static component
 * interactive to decorate a transition — and decoration is what the motion
 * rules forbid. The chevron turns, because that says which state it is in.
 */

const CHEVRON = "m6 9 6 6 6-6"

export function FaqRenderer({ className, props }: ComponentRenderProps): ReactElement {
  const items = readItems(props["items"])

  return (
    <div className={className}>
      {items.map((item) => (
        <details key={item.question}>
          <summary>
            <span className="ck-faq-question">{item.question}</span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d={CHEVRON} />
            </svg>
          </summary>

          <p className="ck-faq-answer">{item.answer}</p>
        </details>
      ))}
    </div>
  )
}
