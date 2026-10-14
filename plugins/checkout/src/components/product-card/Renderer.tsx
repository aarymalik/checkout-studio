"use client"

import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

import { useCheckout } from "../../checkout/CheckoutProvider"
import { formatMoney } from "../../checkout/money"
import { cartQuantity, productView } from "./product"
import { useCartItem } from "./useCartItem"

/**
 * Product Card.
 *
 * ## An article, with a heading
 *
 * A product is a self-contained thing on a page, which is what `<article>` is
 * for, and its title is a heading so the page has an outline somebody can
 * navigate. The level is the merchant's: a card inside a section that already
 * has an `<h2>` needs an `<h3>`, and a component that always emitted the same
 * level would break the outline of every page that nests it differently.
 *
 * ## What a screen reader hears
 *
 * Three of these numbers mean nothing read aloud on their own — "twenty-four
 * ninety-nine, nineteen ninety-nine, two, thirty-nine ninety-eight" is a
 * lottery ticket. Each carries a word that is read and not seen, so the same
 * card is heard as "Was £24.99, £19.99, quantity 2, total £39.98".
 */

const LEVELS = ["h2", "h3", "h4", "h5", "h6"] as const

type Level = (typeof LEVELS)[number]

function headingTag(value: unknown): Level {
  return LEVELS.find((level) => level === value) ?? "h3"
}

export function ProductCardRenderer({
  className,
  props,
  node,
}: ComponentRenderProps): ReactElement {
  const checkout = useCheckout()
  const view = productView(props, checkout?.quote ?? null, node.id)

  useCartItem(node.id, cartQuantity(props))

  const Heading = headingTag(props["headingLevel"])

  return (
    <article className={className}>
      {view.image !== "" ? <img src={view.image} alt={view.imageAlt} /> : null}

      <div className="ck-product-body">
        <Heading>{view.title}</Heading>

        {view.description !== "" ? (
          <p className="ck-product-description">{view.description}</p>
        ) : null}

        {view.sku !== "" ? <p className="ck-product-sku">SKU {view.sku}</p> : null}

        {view.stock !== null ? <p className="ck-product-stock">{view.stock}</p> : null}
      </div>

      <p className="ck-product-prices">
        {view.wasPrice !== null ? (
          <s>
            <span className="ck-product-said">Was </span>
            {formatMoney(view.wasPrice, view.currency)}
          </s>
        ) : null}

        <strong>{formatMoney(view.price, view.currency)}</strong>

        {view.quantity > 1 ? (
          <span className="ck-product-quantity">
            <span className="ck-product-said">quantity </span>
            {`× ${String(view.quantity)}`}
          </span>
        ) : null}

        {view.amount !== null && view.quantity > 1 ? (
          <span className="ck-product-amount">
            <span className="ck-product-said">total </span>
            {formatMoney(view.amount, view.currency)}
          </span>
        ) : null}
      </p>
    </article>
  )
}
