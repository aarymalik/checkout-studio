"use client"

import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

import { useCheckout } from "../../checkout/CheckoutProvider"
import { formatMoney } from "../../checkout/money"

/**
 * Order Bump.
 *
 * ## A checkbox, and nothing cleverer
 *
 * The whole offer is inside a `<label>`, so the entire box is the hit area and
 * a screen reader reads what is being agreed to along with the control: "One
 * time offer, add gift wrapping, £4.99, checkbox, not checked". A `<div>` with
 * a click handler would be a box that cannot be reached by keyboard and says
 * nothing about its own state.
 *
 * ## Accepting it changes the cart, and the cart is priced by the server
 *
 * Ticking it puts this node's id in `selections.bumps` and the provider asks
 * for a new quote. The component adds nothing to any total — the price it
 * shows once accepted is the server's own line for this bump, and before that
 * it is the merchant's asking price, which is a preview rather than a promise.
 *
 * ## What it does not do
 *
 * docs/component-library.md lists Animation as editable, meaning the flashing
 * border these things usually have. That is decoration, and decoration is the
 * one thing the motion rules in CLAUDE.md forbid outright. What is animated is
 * the change of state when somebody ticks it, which is what animation is for
 * — and it lasts no time at all for a reader who has asked for less motion,
 * because the theme's durations collapse under `prefers-reduced-motion`.
 */

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

export function OrderBumpRenderer({ className, props, node }: ComponentRenderProps): ReactElement {
  const checkout = useCheckout()
  const accepted = checkout?.selections.bumps.includes(node.id) === true

  const line = checkout?.quote?.lineItems.find(
    (item) => item.nodeId === node.id && item.kind === "bump",
  )

  const price = line?.amount ?? count(props["price"]) ?? 0
  const currency = checkout?.quote?.currency ?? (text(props["currency"]) || "GBP")

  const badge = text(props["badge"])
  const description = text(props["description"])
  const image = text(props["image"])

  return (
    <div className={className}>
      {/*
       * The accepted state is a class on the label rather than an attribute on
       * the root. Descendant rules are scoped as `.root .type <selector>`, so a
       * class on the root itself is not reachable by them — and an attribute
       * selector is dropped by the renderer's selector grammar entirely.
       */}
      <label className={accepted ? "ck-bump-label ck-bump-on" : "ck-bump-label"}>
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) => {
            checkout?.toggleBump(node.id, event.target.checked)
          }}
        />

        {image !== "" ? <img src={image} alt={text(props["imageAlt"])} /> : null}

        <span className="ck-bump-body">
          {badge !== "" ? <span className="ck-bump-badge">{badge}</span> : null}
          <span className="ck-bump-title">{text(props["title"])}</span>
          {description !== "" ? <span className="ck-bump-description">{description}</span> : null}
        </span>

        <span className="ck-bump-price">{formatMoney(price, currency)}</span>
      </label>
    </div>
  )
}
