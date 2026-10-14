"use client"

import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import { useState } from "react"
import type { KeyboardEvent, ReactElement } from "react"

import { useCheckout } from "../../checkout/CheckoutProvider"
import { formatMoney } from "../../checkout/money"

/**
 * Coupon.
 *
 * ## The browser never decides anything
 *
 * Typing a code sets it in the selections and asks the server to price the
 * cart again. Whether it exists, whether it has expired, whether this order is
 * big enough, whether the last redemption has gone — all of that is in
 * docs/stripe-integration.md, and all of it happens on the server. This
 * component has no idea what a valid code looks like, which is the point: a
 * discount a browser could decide is a discount anybody can award themselves.
 *
 * ## Four states, and the one between them
 *
 * Idle, pending, applied, rejected. Pending is the one worth naming: the
 * server is being asked, the total on screen is the old one, and the button
 * must not be pressable twice. It is marked rather than disabled —
 * `aria-disabled` keeps the focus where the person put it, and a disabled
 * button under somebody's finger moves focus to the body.
 *
 * ## It is a button that is not a submit button
 *
 * A coupon usually sits inside the checkout's form. `type="button"`, and Enter
 * in the field is handled here, because either one left alone submits the
 * order — a customer pressing Enter after a discount code would buy the thing.
 *
 * ## One live region, always mounted
 *
 * The message is the same element in every state. A region added at the moment
 * it has something to say is a region nothing was listening to.
 */

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback
}

export function CouponRenderer({ className, props, node }: ComponentRenderProps): ReactElement {
  const checkout = useCheckout()
  const [typed, setTyped] = useState("")

  const code = checkout?.selections.couponCode
  const pending = checkout?.stale === true && code !== undefined
  const applied = code !== undefined && !pending
  const rejected = checkout?.rejectedCoupon ?? null

  const inputId = `ck-coupon-${node.id}`
  const messageId = `${inputId}-message`

  const label = text(props["label"], "Discount code")
  const discount = checkout?.quote?.discount ?? 0
  const currency = checkout?.quote?.currency ?? "GBP"

  function apply(): void {
    const trimmed = typed.trim()

    if (pending || trimmed === "") return

    checkout?.applyCoupon(trimmed)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== "Enter") return

    // Otherwise this submits the order.
    event.preventDefault()
    apply()
  }

  const message = rejected
    ? text(rejected.message, text(props["validationMessage"], "That code cannot be used."))
    : pending
      ? "Checking that code…"
      : applied
        ? text(props["successMessage"], "Discount applied.")
        : ""

  return (
    <div className={className}>
      {applied ? (
        <p className="ck-coupon-applied">
          <span className="ck-coupon-code">{code}</span>
          {discount > 0 ? (
            <span className="ck-coupon-amount">{`-${formatMoney(discount, currency)}`}</span>
          ) : null}
          <button
            type="button"
            className="ck-coupon-remove"
            onClick={() => {
              setTyped("")
              checkout?.removeCoupon()
            }}
          >
            {text(props["removeLabel"], "Remove")}
          </button>
        </p>
      ) : (
        <>
          <label htmlFor={inputId}>{label}</label>
          <span className="ck-coupon-row">
            <input
              id={inputId}
              type="text"
              className={rejected !== null ? "ck-coupon-invalid" : undefined}
              value={typed}
              placeholder={text(props["placeholder"], "Enter a code")}
              autoComplete="off"
              aria-describedby={messageId}
              aria-invalid={rejected !== null ? true : undefined}
              onChange={(event) => {
                setTyped(event.target.value)
              }}
              onKeyDown={onKeyDown}
            />
            <button
              type="button"
              className={pending ? "ck-coupon-waiting" : undefined}
              onClick={apply}
              aria-disabled={pending ? true : undefined}
              aria-busy={pending ? true : undefined}
            >
              {text(props["buttonLabel"], "Apply")}
            </button>
          </span>
        </>
      )}

      <p id={messageId} role="status" aria-live="polite" className="ck-coupon-message">
        {message}
      </p>
    </div>
  )
}
