"use client"

import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

import { useCheckout } from "../../checkout/CheckoutProvider"
import { formatMoney } from "../../checkout/money"
import { summaryRows } from "./rows"

/**
 * Order Summary.
 *
 * ## It does no arithmetic, and that is checkable
 *
 * Every number on screen is a field of the quote the server returned. There is
 * no `+` in this file. Phase 11's exit criteria put it as "no component
 * computes a monetary amount", and the reason is that a summary which added up
 * its own lines could disagree with the charge — a customer would read the
 * total, and Stripe would take the other one.
 *
 * ## A definition list, not a table
 *
 * Each row is a term and its amount, which is what `<dl>` is for: a screen
 * reader announces "Subtotal, nineteen pounds ninety-nine" as a pair. A table
 * would promise rows and columns that are not there, and a stack of `<div>`s
 * would announce six unrelated numbers.
 *
 * ## While a new quote is coming
 *
 * The old one stays, marked `aria-busy`, rather than disappearing — a total
 * that vanishes every time somebody changes a quantity is a checkout that
 * flickers. What is never shown is a stale total presented as final: the
 * attribute is how a screen reader and a stylesheet both know.
 */
export function OrderSummaryRenderer({ className, props }: ComponentRenderProps): ReactElement {
  const checkout = useCheckout()
  const quote = checkout?.quote ?? null

  if (quote === null) {
    /*
     * No total at all — before the first quote, or after one failed. The
     * difference matters to the person: one is a moment, the other needs
     * saying.
     */
    return (
      <div className={className} data-ck-summary-empty>
        <p>{checkout?.problem?.message ?? "Working out your total…"}</p>
      </div>
    )
  }

  const rows = summaryRows(quote, props)

  return (
    <dl className={className} aria-busy={checkout?.stale === true ? true : undefined}>
      {rows.map((row) => (
        <div key={row.key} data-ck-summary-row={row.key}>
          <dt>{row.label}</dt>
          <dd>{formatMoney(row.amount, quote.currency)}</dd>
        </div>
      ))}
    </dl>
  )
}
