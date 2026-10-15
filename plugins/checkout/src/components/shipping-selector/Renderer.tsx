"use client"

import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

import { useCheckout } from "../../checkout/CheckoutProvider"
import { formatMoney } from "../../checkout/money"

/**
 * Shipping Selector.
 *
 * ## A radio group, because it is one
 *
 * `<fieldset>` with a `<legend>`, and a radio per method. A screen reader
 * announces the group's name and "two of four" as somebody moves through it,
 * and the arrow keys work without anybody writing a key handler. A list of
 * clickable `<div>`s would be none of that.
 *
 * ## The methods are the server's, and so is the tick
 *
 * What is available depends on the cart and the address, and each one has a
 * price — so the list arrives with the quote rather than being authored on the
 * page. The method shown as chosen is the one the *quote* was priced with, not
 * the one somebody last clicked: showing the click would put a tick beside a
 * method while the total next to it still described the old one.
 *
 * That means a click takes a moment to show. The group is marked `aria-busy`
 * while it does, which is the honest version of the same thing.
 *
 * ## Nothing to choose from
 *
 * Before the first quote, on a canvas, or for an order that has no shipping at
 * all. It says so rather than drawing an empty box — and it does not invent
 * example methods to fill the space, because a merchant who styles a page
 * against invented options is styling a page they will never see.
 */

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback
}

export function ShippingSelectorRenderer({
  className,
  props,
  node,
}: ComponentRenderProps): ReactElement {
  const checkout = useCheckout()
  const quote = checkout?.quote ?? null
  const methods = quote?.shippingMethods ?? []
  const legend = text(props["label"], "Delivery")

  if (methods.length === 0) {
    return (
      <div className={className}>
        <p className="ck-shipping-legend">{legend}</p>
        <p className="ck-shipping-empty">
          {text(props["emptyMessage"], "Delivery options appear once your order has been priced.")}
        </p>
      </div>
    )
  }

  const chosen = quote?.shippingMethodId ?? checkout?.selections.shippingMethodId

  return (
    <fieldset className={className} aria-busy={checkout?.stale === true ? true : undefined}>
      <legend className="ck-shipping-legend">{legend}</legend>

      {methods.map((method) => (
        <label key={method.id} className="ck-shipping-method">
          <input
            type="radio"
            name={`ck-shipping-${node.id}`}
            value={method.id}
            checked={method.id === chosen}
            onChange={() => {
              checkout?.chooseShipping(method.id)
            }}
          />

          <span className="ck-shipping-body">
            <span className="ck-shipping-label">{method.label}</span>
            {method.description !== undefined && method.description !== "" ? (
              <span className="ck-shipping-note">{method.description}</span>
            ) : null}
          </span>

          <span className="ck-shipping-amount">
            {method.amount === 0
              ? text(props["freeLabel"], "Free")
              : formatMoney(method.amount, quote?.currency ?? "GBP")}
          </span>
        </label>
      ))}
    </fieldset>
  )
}
