"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import type { ReactElement, ReactNode } from "react"

import type { CartItem, CheckoutDataSource, Quote, QuoteProblem, Selections } from "./source"

/**
 * The cart, and the numbers the server returned for it.
 *
 * ## What it holds and what it refuses to hold
 *
 * Selections are the customer's: which products, how many, which bump, which
 * coupon code they typed. The quote is the server's: every amount, the
 * currency, the line items, and a signature.
 *
 * Nothing here combines the two. There is no "subtotal plus shipping" in this
 * file, because a component that could work out a total is a component that
 * could show a different one from the charge — which
 * docs/stripe-integration.md forbids in those words.
 *
 * ## Three states, and the middle one matters most
 *
 * A quote is pending, settled, or failed. The pending state keeps the previous
 * quote *visible but marked stale*, because a total that vanishes while
 * somebody changes a quantity is a checkout that flickers — and a stale total
 * presented as final is worse than either. `stale` is how a component tells
 * them apart.
 *
 * A failure keeps no total at all. "Never a wrong total" is the rule; showing
 * the last good one next to a new cart would be exactly that.
 */

export interface CheckoutState {
  selections: Selections
  /** The server's last good answer, or null before the first one arrives. */
  quote: Quote | null
  /** True while a newer quote is being fetched. The quote above is the old one. */
  stale: boolean
  /** Why the last attempt failed, or null. */
  problem: QuoteProblem | null
  /**
   * The code the server refused, and what it said about it.
   *
   * Separate from `problem` because a refused coupon is not a failed quote.
   * The cart is exactly what it was, the total that was on screen is still
   * the right one, and the only thing that went wrong is a string somebody
   * typed. It is cleared when a coupon is applied or one succeeds.
   */
  rejectedCoupon: RejectedCoupon | null
  setQuantity: (nodeId: string, quantity: number) => void
  toggleBump: (nodeId: string, accepted: boolean) => void
  applyCoupon: (code: string) => void
  removeCoupon: () => void
  chooseShipping: (methodId: string) => void
}

export interface RejectedCoupon {
  code: string
  message: string
}

const CheckoutContext = createContext<CheckoutState | null>(null)

/**
 * The checkout a component is inside, or null.
 *
 * Null rather than throwing, for the reason the form's is: a component dropped
 * onto a canvas has no checkout around it yet, and one that threw would take
 * the editor down for a page that is merely half-built.
 */
export function useCheckout(): CheckoutState | null {
  return useContext(CheckoutContext)
}

export interface CheckoutProviderProps {
  children: ReactNode
  /**
   * Where the numbers come from.
   *
   * The interface, never an implementation — Phase 13 supplies the one that
   * talks to the pricing engine, and the tests supply one that answers from
   * memory. This provider cannot tell which it has, which is the point.
   */
  source: CheckoutDataSource
  /** What is in the cart before the customer touches anything. */
  initialItems?: readonly CartItem[]
}

export function CheckoutProvider({
  children,
  source,
  initialItems = [],
}: CheckoutProviderProps): ReactElement {
  const [selections, setSelections] = useState<Selections>({ items: initialItems, bumps: [] })
  const [quote, setQuote] = useState<Quote | null>(null)
  const [stale, setStale] = useState(false)
  const [problem, setProblem] = useState<QuoteProblem | null>(null)
  const [rejectedCoupon, setRejectedCoupon] = useState<RejectedCoupon | null>(null)

  /*
   * The request in flight, so a slower earlier answer cannot overwrite a
   * faster later one. Changing a quantity twice quickly is the ordinary way
   * that happens, and the result would be a total for a cart nobody has.
   */
  const inFlight = useRef<AbortController | null>(null)

  /*
   * The source, held rather than depended on.
   *
   * An application writes `source={{ quote: ... }}` in its JSX — the gallery
   * does, and it is the obvious thing to write. That object is a new one every
   * render, so an effect that listed it would re-quote on every render of the
   * page, for ever, and the only symptom would be a server bill.
   *
   * What makes a new quote necessary is a change in *selections*, which is the
   * only dependency below. Swapping one data source for another mid-checkout
   * is not a thing that happens: the application mounts this with the one it
   * has.
   *
   * The same mistake, written the same way, re-registered a form field on
   * every render twice in core-forms. An effect that writes to the state that
   * re-renders it must be given nothing that is rebuilt each time.
   */
  const latest = useRef(source)

  latest.current = source

  useEffect(() => {
    inFlight.current?.abort()

    /*
     * Nothing to price.
     *
     * A Product Card puts its own product in the cart from an effect, so the
     * first render of every checkout has an empty one — and asking a server
     * what an empty cart costs is a request whose answer is already known.
     * Without this the page quotes twice on load, aborts the first, and pays
     * for a round trip to learn nothing.
     *
     * It is also simply true: an order with nothing in it has no total, which
     * is a different thing from a total that has not arrived yet.
     */
    if (selections.items.length === 0 && selections.bumps.length === 0) {
      setQuote(null)
      setProblem(null)
      setStale(false)

      return
    }

    const controller = new AbortController()

    inFlight.current = controller
    setStale(true)

    latest.current
      .quote(selections, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return

        if (result.ok) {
          setQuote(result.quote)
          setProblem(null)
          /*
           * A refusal is *not* cleared here. Refusing a code removes it from
           * the selections, which asks for the cart to be priced again without
           * it — and that quote succeeds. Clearing on success wiped the
           * explanation in the same breath it was written, so the field went
           * back to idle and the customer was never told anything.
           *
           * It is cleared when they touch the coupon again: applying another
           * code, or removing one.
           */
        } else if (result.problem.code === "coupon-rejected") {
          /*
           * A refused code is not a failed quote.
           *
           * The cart is unchanged — a coupon that was not applied changed
           * nothing — so the total already on screen still describes it, and
           * throwing it away would blank a correct number because somebody
           * mistyped a word. The code comes out of the selections, which asks
           * for the cart to be priced again without it; what the server said
           * about the code is kept for the component that asked.
           */
          setRejectedCoupon({
            code: result.problem.couponCode ?? selections.couponCode ?? "",
            message: result.problem.message,
          })
          setProblem(null)
          setSelections((current) => {
            if (current.couponCode === undefined) return current

            const { couponCode: _refused, ...rest } = current

            return rest
          })
        } else {
          /*
           * The total goes. Showing the last good one beside a cart it does
           * not describe is the "wrong total" the rules are about — a customer
           * would read it as the price of what they are now looking at.
           */
          setQuote(null)
          setProblem(result.problem)
        }

        setStale(false)
      })
      .catch(() => {
        if (controller.signal.aborted) return

        setQuote(null)
        setProblem({ code: "unknown", message: "We could not work out your total just now." })
        setStale(false)
      })

    return () => {
      controller.abort()
    }
  }, [selections])

  const setQuantity = useCallback((nodeId: string, quantity: number) => {
    setSelections((current) => {
      const existing = current.items.find((item) => item.nodeId === nodeId)

      /*
       * Setting a quantity to what it already is returns the same object, so
       * React bails out of the re-render and the quote effect never sees a
       * change. Without it, every repeat of a value — a card re-running its
       * effect, a parent re-rendering — would build a new selections object
       * and buy a quote for a cart nobody touched.
       */
      if (existing?.quantity === quantity) return current
      if (existing === undefined && quantity <= 0) return current

      // Zero removes it: a card that has gone should not still be priced.
      if (quantity <= 0) {
        return { ...current, items: current.items.filter((item) => item.nodeId !== nodeId) }
      }

      return {
        ...current,
        items:
          existing === undefined
            ? [...current.items, { nodeId, quantity }]
            : current.items.map((item) => (item.nodeId === nodeId ? { ...item, quantity } : item)),
      }
    })
  }, [])

  const toggleBump = useCallback((nodeId: string, accepted: boolean) => {
    setSelections((current) => {
      /*
       * The same object when the answer is already the answer. Spreading
       * regardless changed `selections` by identity alone, and the quote
       * effect would buy a fresh quote for a cart nobody touched — the same
       * mistake `setQuantity` had, and the filter below is the quiet half of
       * it: filtering an array that contains nothing to remove still returns
       * a new array.
       */
      if (current.bumps.includes(nodeId) === accepted) return current

      return {
        ...current,
        bumps: accepted
          ? [...current.bumps, nodeId]
          : current.bumps.filter((bump) => bump !== nodeId),
      }
    })
  }, [])

  const applyCoupon = useCallback((code: string) => {
    setRejectedCoupon(null)
    setSelections((current) =>
      current.couponCode === code ? current : { ...current, couponCode: code },
    )
  }, [])

  const removeCoupon = useCallback(() => {
    setRejectedCoupon(null)
    /*
     * The same object when there was no coupon. An updater that spread a new
     * one regardless would change `selections` by identity alone, and the
     * quote effect would buy a fresh quote for a cart nobody touched.
     */
    setSelections((current) => {
      if (current.couponCode === undefined) return current

      const { couponCode: _removed, ...rest } = current

      return rest
    })
  }, [])

  const chooseShipping = useCallback((methodId: string) => {
    setSelections((current) => ({ ...current, shippingMethodId: methodId }))
  }, [])

  const state = useMemo<CheckoutState>(
    () => ({
      selections,
      quote,
      stale,
      problem,
      rejectedCoupon,
      setQuantity,
      toggleBump,
      applyCoupon,
      removeCoupon,
      chooseShipping,
    }),
    [
      selections,
      quote,
      stale,
      problem,
      rejectedCoupon,
      setQuantity,
      toggleBump,
      applyCoupon,
      removeCoupon,
      chooseShipping,
    ],
  )

  return <CheckoutContext.Provider value={state}>{children}</CheckoutContext.Provider>
}
