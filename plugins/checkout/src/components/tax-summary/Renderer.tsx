"use client"

import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

import { useCheckout } from "../../checkout/CheckoutProvider"
import { formatMoney } from "../../checkout/money"

/**
 * Tax Summary.
 *
 * ## It shows the server's working, and does none of its own
 *
 * A quote carries a `tax` total and, when the server broke it down, a line per
 * rate — "VAT 20%", "State tax", whichever applies where the customer is. This
 * lists those lines when they exist and the single total when they do not. It
 * never adds them up and never works a rate out from a percentage: a tax
 * figure a browser computed is a tax figure that can disagree with the one
 * being remitted.
 *
 * ## A definition list, like the order summary
 *
 * Each row is a term and an amount, so it is read as a pair. The two
 * components agree on that because they are the same kind of thing — this one
 * is the detail behind one of the other's rows.
 */

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback
}

export function TaxSummaryRenderer({ className, props }: ComponentRenderProps): ReactElement {
  const checkout = useCheckout()
  const quote = checkout?.quote ?? null

  const lines = quote?.lineItems.filter((item) => item.kind === "tax") ?? []
  const heading = text(props["label"], "Tax")

  /*
   * No tax, or no quote yet. Hidden rather than shown as zero when the
   * merchant asks: "Tax £0.00" on an order that attracts none is a line that
   * makes somebody look twice at a bill that is already correct.
   */
  if (
    quote === null ||
    (quote.tax === 0 && lines.length === 0 && props["hideWhenZero"] !== false)
  ) {
    return <div className={className} data-ck-tax-empty />
  }

  const rows =
    lines.length > 0
      ? lines.map((line) => ({ key: line.nodeId, label: line.label, amount: line.amount }))
      : [{ key: "tax", label: heading, amount: quote.tax }]

  const note = text(props["note"], "")

  return (
    <div className={className}>
      {/*
       * The note is a sibling of the list, not a child of it. A `<dl>` may
       * hold `<dt>`, `<dd>` and `<div>` and nothing else — a paragraph inside
       * one is invalid, and what a screen reader makes of the list after that
       * is anybody's guess.
       */}
      <dl aria-busy={checkout?.stale === true ? true : undefined}>
        {rows.map((row) => (
          <div key={row.key} data-ck-tax-row={row.key}>
            <dt>{row.label}</dt>
            <dd>{formatMoney(row.amount, quote.currency)}</dd>
          </div>
        ))}
      </dl>

      {note !== "" ? <p className="ck-tax-note">{note}</p> : null}
    </div>
  )
}
