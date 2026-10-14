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
  setQuantity: (nodeId: string, quantity: number) => void
  toggleBump: (nodeId: string, accepted: boolean) => void
  applyCoupon: (code: string) => void
  removeCoupon: () => void
  chooseShipping: (methodId: string) => void
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

  /*
   * The request in flight, so a slower earlier answer cannot overwrite a
   * faster later one. Changing a quantity twice quickly is the ordinary way
   * that happens, and the result would be a total for a cart nobody has.
   */
  const inFlight = useRef<AbortController | null>(null)

  useEffect(() => {
    inFlight.current?.abort()

    const controller = new AbortController()

    inFlight.current = controller
    setStale(true)

    source
      .quote(selections, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return

        if (result.ok) {
          setQuote(result.quote)
          setProblem(null)
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
  }, [source, selections])

  const setQuantity = useCallback((nodeId: string, quantity: number) => {
    setSelections((current) => ({
      ...current,
      items:
        quantity <= 0
          ? current.items.filter((item) => item.nodeId !== nodeId)
          : current.items.some((item) => item.nodeId === nodeId)
            ? current.items.map((item) => (item.nodeId === nodeId ? { ...item, quantity } : item))
            : [...current.items, { nodeId, quantity }],
    }))
  }, [])

  const toggleBump = useCallback((nodeId: string, accepted: boolean) => {
    setSelections((current) => ({
      ...current,
      bumps: accepted
        ? current.bumps.includes(nodeId)
          ? current.bumps
          : [...current.bumps, nodeId]
        : current.bumps.filter((bump) => bump !== nodeId),
    }))
  }, [])

  const applyCoupon = useCallback((code: string) => {
    setSelections((current) => ({ ...current, couponCode: code }))
  }, [])

  const removeCoupon = useCallback(() => {
    setSelections(({ couponCode: _removed, ...rest }) => rest)
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
      setQuantity,
      toggleBump,
      applyCoupon,
      removeCoupon,
      chooseShipping,
    ],
  )

  return <CheckoutContext.Provider value={state}>{children}</CheckoutContext.Provider>
}
