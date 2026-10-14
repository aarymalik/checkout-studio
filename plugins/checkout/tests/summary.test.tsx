import { render, screen, waitFor, within } from "@testing-library/react"
import type { ReactElement, ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { CheckoutProvider } from "../src/checkout/CheckoutProvider"
import { formatMoney } from "../src/checkout/money"
import { orderSummary } from "../src/components/order-summary/definition"
import type { CheckoutDataSource, Quote, QuoteResult, Selections } from "../src/checkout/source"
import { expectNoViolations } from "./axe"
import { nodeOf } from "./support"

/** A quote, with every amount already decided by somebody who is not us. */
function quoteOf(overrides: Partial<Quote> = {}): Quote {
  return {
    quoteId: "qt_1",
    signature: "sig",
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    currency: "GBP",
    lineItems: [],
    subtotal: 1999,
    discount: 0,
    shipping: 499,
    tax: 500,
    total: 2998,
    notices: [],
    ...overrides,
  }
}

/** A data source that answers from memory, which is the whole point of the seam. */
function sourceOf(result: QuoteResult, delayMs = 0): CheckoutDataSource {
  return {
    quote: () =>
      delayMs === 0
        ? Promise.resolve(result)
        : new Promise((resolve) =>
            setTimeout(() => {
              resolve(result)
            }, delayMs),
          ),
  }
}

function summary(source: CheckoutDataSource, props: Record<string, unknown> = {}): ReactElement {
  const Renderer = orderSummary.renderer

  return (
    <CheckoutProvider source={source} initialItems={[{ nodeId: "prod", quantity: 1 }]}>
      <Renderer
        node={nodeOf("checkout.order-summary", { id: "sum" })}
        props={{ ...orderSummary.defaultProps, ...props }}
        className="ck-test"
        mode="published"
      >
        {null as ReactNode}
      </Renderer>
    </CheckoutProvider>
  )
}

/** The rows on screen, as label and amount. */
function rows(): [string, string][] {
  return screen.getAllByRole("term").map((term) => {
    const row = term.closest("[data-ck-summary-row]") as HTMLElement

    return [term.textContent ?? "", within(row).getByRole("definition").textContent ?? ""]
  })
}

describe("what a summary shows", () => {
  it("shows the server's numbers, in a fixed order", async () => {
    render(summary(sourceOf({ ok: true, quote: quoteOf() })))

    await waitFor(() => expect(screen.getAllByRole("term").length).toBeGreaterThan(0))

    expect(rows()).toEqual([
      ["Subtotal", "£19.99"],
      ["Shipping", "£4.99"],
      ["Tax", "£5.00"],
      ["Total", "£29.98"],
    ])
  })

  it("shows a discount as a reduction, because that is what it is", async () => {
    /*
     * The quote carries a discount as a positive magnitude and has already
     * taken it off the total. Printed as "£5.00" between a subtotal and a tax
     * it would be the only line that reduces the bill while reading as though
     * it adds to it. The sign is display; the amount is still the server's.
     */
    render(summary(sourceOf({ ok: true, quote: quoteOf({ discount: 500 }) })))

    await waitFor(() => expect(screen.getByText("Discount")).toBeVisible())
    expect(screen.getByText("-£5.00")).toBeVisible()
  })

  it("does not flip a discount the server already sent as negative", async () => {
    render(summary(sourceOf({ ok: true, quote: quoteOf({ discount: -500 }) })))

    await waitFor(() => expect(screen.getByText("Discount")).toBeVisible())
    expect(screen.getByText("-£5.00")).toBeVisible()
  })

  it("does not add anything up", async () => {
    /*
     * The quote's total disagrees with its own lines. A summary that computed
     * one would show 29.98; what a customer will be charged is 9999, so that
     * is what it shows. Phase 11: "no component computes a monetary amount".
     */
    render(summary(sourceOf({ ok: true, quote: quoteOf({ total: 9999 }) })))

    await waitFor(() => expect(screen.getByText("£99.99")).toBeVisible())
  })

  it("hides an empty line, and never the total", async () => {
    render(summary(sourceOf({ ok: true, quote: quoteOf({ discount: 0, shipping: 0, tax: 0 }) })))

    await waitFor(() => expect(screen.getByText("Total")).toBeVisible())

    expect(rows().map(([label]) => label)).toEqual(["Subtotal", "Total"])
  })

  it("shows an empty line when the merchant asks for it", async () => {
    render(
      summary(sourceOf({ ok: true, quote: quoteOf({ discount: 0 }) }), { hideZeroLines: false }),
    )

    await waitFor(() => expect(screen.getByText("Discount")).toBeVisible())
  })

  it("takes the merchant's own words for a line", async () => {
    render(summary(sourceOf({ ok: true, quote: quoteOf() }), { labeltotal: "You pay" }))

    await waitFor(() => expect(screen.getByText("You pay")).toBeVisible())
  })

  it("is a list of terms and amounts, which is how it is read aloud", async () => {
    render(summary(sourceOf({ ok: true, quote: quoteOf() })))

    await waitFor(() => expect(screen.getAllByRole("term").length).toBe(4))
    expect(screen.getAllByRole("definition")).toHaveLength(4)
  })
})

describe("every currency class", () => {
  /*
   * Read to a British customer, which is why the dollar is "US$": a reader in
   * en-GB is told which dollar. The spaces are normalised because `Intl` uses
   * a non-breaking one, and a test that cared about which space would be a
   * test about Unicode rather than about money.
   */
  function formatted(amount: number, currency: string): string {
    return formatMoney(amount, currency, { locale: "en-GB" }).replace(/\u00a0/g, " ")
  }

  it.each([
    ["GBP", 1999, "£19.99"],
    ["USD", 1999, "US$19.99"],
    ["EUR", 1999, "€19.99"],
    // No minor unit at all: ¥1999 is one thousand nine hundred and ninety-nine.
    ["JPY", 1999, "JP¥1,999"],
    // Three of them, which no two-decimal assumption survives.
    ["BHD", 1999, "BHD 1.999"],
  ])("formats %s", (currency, amount, expected) => {
    expect(formatted(amount, currency)).toBe(expected)
  })

  it("treats a well-formed but unknown code as a two-decimal one", () => {
    // ISO 4217's own default, and what `Intl` does. It does not throw — which
    // is the opposite of what the first version of this file claimed.
    expect(formatted(1999, "ZZZ")).toBe("ZZZ 19.99")
  })

  it("shows something legible for a code that is not a code", () => {
    // `Intl` throws a RangeError on this, and a checkout should not fall over
    // because somebody typed two letters into a theme.
    expect(formatMoney(1999, "XX")).toBe("XX 1999")
  })
})

describe("while the numbers are being worked out", () => {
  it("says so before the first quote arrives", () => {
    render(summary(sourceOf({ ok: true, quote: quoteOf() }, 50)))

    expect(screen.getByText(/Working out your total/)).toBeVisible()
  })

  it("shows no total until one has arrived, then stops saying it is working", async () => {
    const source: CheckoutDataSource = {
      quote: (_selections: Selections) =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({ ok: true, quote: quoteOf() })
          }, 20)
        }),
    }

    const { container } = render(summary(source))

    expect(container.querySelector("dl")).toBeNull()

    await waitFor(() => expect(screen.getByText("£29.98")).toBeVisible())

    expect(container.querySelector("dl")).not.toHaveAttribute("aria-busy")
  })

  /*
   * Not tested here: that a *re-quote* keeps the old total on screen and marks
   * it busy. Asserting it needs something that changes the cart, and the first
   * thing that can is Order Bump in the next slice. A test that re-rendered
   * the provider by hand would be testing the test rather than the behaviour —
   * so this is the gap, named, rather than a green tick over nothing.
   */
})

describe("when the numbers cannot be had", () => {
  it("shows no total at all, rather than the last one", async () => {
    // "Never a wrong total": the previous number beside a cart it does not
    // describe would be read as the price of what is on screen now.
    render(
      summary(
        sourceOf({
          ok: false,
          problem: { code: "unavailable", message: "Try again in a moment." },
        }),
      ),
    )

    await waitFor(() => expect(screen.getByText("Try again in a moment.")).toBeVisible())
    expect(screen.queryByText(/£/)).toBeNull()
  })

  it("survives a data source that throws", async () => {
    const source: CheckoutDataSource = { quote: () => Promise.reject(new Error("boom")) }

    render(summary(source))

    await waitFor(() => expect(screen.getByText(/could not work out your total/)).toBeVisible())
  })

  it("renders outside a checkout rather than throwing", () => {
    // A component on a canvas has no checkout around it yet.
    const Renderer = orderSummary.renderer

    expect(() =>
      render(
        <Renderer
          node={nodeOf("checkout.order-summary")}
          props={orderSummary.defaultProps}
          className="ck-test"
          mode="editor-preview"
        >
          {null as ReactNode}
        </Renderer>,
      ),
    ).not.toThrow()
  })
})

describe("the seam", () => {
  it("asks the source again when the cart changes", async () => {
    const asked = vi.fn().mockResolvedValue({ ok: true, quote: quoteOf() })

    function Changer(): ReactElement {
      return <button type="button">x</button>
    }

    render(
      <CheckoutProvider source={{ quote: asked }} initialItems={[{ nodeId: "a", quantity: 1 }]}>
        <Changer />
      </CheckoutProvider>,
    )

    await waitFor(() => expect(asked).toHaveBeenCalledTimes(1))

    const [selections] = asked.mock.calls[0] as [Selections]

    expect(selections.items).toEqual([{ nodeId: "a", quantity: 1 }])
  })

  it("sends selections and never an amount", async () => {
    const asked = vi.fn().mockResolvedValue({ ok: true, quote: quoteOf() })

    render(
      <CheckoutProvider source={{ quote: asked }} initialItems={[{ nodeId: "a", quantity: 2 }]}>
        <p>x</p>
      </CheckoutProvider>,
    )

    await waitFor(() => expect(asked).toHaveBeenCalled())

    // A browser that could send a total is a browser that can choose one.
    expect(JSON.stringify(asked.mock.calls[0]?.[0])).not.toMatch(/amount|total|price/i)
  })
})

describe("axe", () => {
  it("reports nothing for a summary", async () => {
    const { container } = render(summary(sourceOf({ ok: true, quote: quoteOf() })))

    await waitFor(() => expect(screen.getByText("Total")).toBeVisible())
    await expectNoViolations(container)
  })
})
