import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactElement, ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { CheckoutProvider } from "../src/checkout/CheckoutProvider"
import type { CheckoutDataSource, Quote, Selections } from "../src/checkout/source"
import { orderBump } from "../src/components/order-bump/definition"
import { orderSummary } from "../src/components/order-summary/definition"
import { productCard } from "../src/components/product-card/definition"
import { expectNoViolations } from "./axe"
import { nodeOf } from "./support"

const WRAP = 499

function quoteOf(bumped: boolean): Quote {
  return {
    quoteId: "qt_1",
    signature: "sig",
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    currency: "GBP",
    lineItems: bumped
      ? [
          {
            nodeId: "bump",
            kind: "bump",
            label: "Gift wrapping",
            quantity: 1,
            unitAmount: WRAP,
            amount: WRAP,
          },
        ]
      : [],
    subtotal: bumped ? 1999 + WRAP : 1999,
    discount: 0,
    shipping: 0,
    tax: 0,
    total: bumped ? 1999 + WRAP : 1999,
    notices: [],
  }
}

/** Prices the cart, and charges for the bump when it has been accepted. */
function priced(): CheckoutDataSource {
  return {
    quote: (selections: Selections) =>
      Promise.resolve({ ok: true, quote: quoteOf(selections.bumps.includes("bump")) }),
  }
}

/** A product, an offer, and a summary. */
function page(source: CheckoutDataSource, props: Record<string, unknown> = {}): ReactElement {
  const Card = productCard.renderer
  const Bump = orderBump.renderer
  const Summary = orderSummary.renderer

  return (
    <CheckoutProvider source={source}>
      <Card
        node={nodeOf("checkout.product-card", { id: "prod" })}
        props={productCard.defaultProps}
        className="ck-card"
        mode="published"
      >
        {null as ReactNode}
      </Card>
      <Bump
        node={nodeOf("checkout.order-bump", { id: "bump" })}
        props={{ ...orderBump.defaultProps, ...props }}
        className="ck-bump"
        mode="published"
      >
        {null as ReactNode}
      </Bump>
      <Summary
        node={nodeOf("checkout.order-summary", { id: "sum" })}
        props={orderSummary.defaultProps}
        className="ck-summary"
        mode="published"
      >
        {null as ReactNode}
      </Summary>
    </CheckoutProvider>
  )
}

function total(): string {
  const row = document.querySelector('[data-ck-summary-row="total"]')

  return row === null ? "" : (within(row as HTMLElement).getByRole("definition").textContent ?? "")
}

function offer(): HTMLInputElement {
  return screen.getByRole("checkbox")
}

describe("an offer nobody has taken", () => {
  it("is a checkbox that says what it is and what it costs", async () => {
    render(page(priced()))

    await waitFor(() => expect(total()).toBe("£19.99"))

    /*
     * The whole offer is the checkbox's name, which is what somebody agreeing
     * to it is agreeing to. A control named only "Add" would be a box people
     * tick without knowing the price.
     */
    expect(offer()).not.toBeChecked()
    expect(offer()).toHaveAccessibleName(/Add gift wrapping/)
    expect(offer()).toHaveAccessibleName(/£4\.99/)
  })

  it("is not in the cart until it is taken", async () => {
    // What makes it an offer rather than a product: a bump nobody accepted is
    // not something anybody is being asked to pay for.
    const asked = vi.fn().mockResolvedValue({ ok: true, quote: quoteOf(false) })

    render(page({ quote: asked }))

    await waitFor(() => expect(asked).toHaveBeenCalled())

    expect(asked.mock.calls[0]?.[0]).toMatchObject({ bumps: [] })
  })

  it("shows the merchant's asking price before any quote mentions it", async () => {
    render(page(priced(), { price: 1250 }))

    expect(await screen.findByText("£12.50")).toBeVisible()
  })

  it("takes the merchant's own words", async () => {
    render(
      page(priced(), {
        title: "Add a warranty",
        description: "Two years, parts and labour.",
        badge: "Popular",
      }),
    )

    await waitFor(() => expect(total()).toBe("£19.99"))

    expect(screen.getByText("Add a warranty")).toBeVisible()
    expect(screen.getByText("Two years, parts and labour.")).toBeVisible()
    expect(screen.getByText("Popular")).toBeVisible()
  })

  it("renders outside a checkout rather than throwing", () => {
    const Bump = orderBump.renderer

    expect(() =>
      render(
        <Bump
          node={nodeOf("checkout.order-bump", { id: "bump" })}
          props={orderBump.defaultProps}
          className="ck-bump"
          mode="editor-preview"
        >
          {null as ReactNode}
        </Bump>,
      ),
    ).not.toThrow()
  })
})

describe("taking the offer", () => {
  it("puts it in the cart", async () => {
    const asked = vi.fn((selections: Selections) =>
      Promise.resolve({ ok: true, quote: quoteOf(selections.bumps.includes("bump")) } as const),
    )

    render(page({ quote: asked }))

    await waitFor(() => expect(total()).toBe("£19.99"))

    await userEvent.click(offer())

    await waitFor(() => expect(asked.mock.calls.at(-1)?.[0].bumps).toEqual(["bump"]))
  })

  it("asks the server again rather than adding it up here", async () => {
    const asked = vi.fn((selections: Selections) =>
      Promise.resolve({ ok: true, quote: quoteOf(selections.bumps.includes("bump")) } as const),
    )

    render(page({ quote: asked }))

    await waitFor(() => expect(asked).toHaveBeenCalledTimes(1))

    await userEvent.click(offer())

    await waitFor(() => expect(asked).toHaveBeenCalledTimes(2))
    expect(total()).toBe("£24.98")
  })

  it("shows the server's price for it once it is in", async () => {
    /*
     * The quote's own line for this bump, not the asking price. If the two
     * ever disagree the charge is the server's, so that is the number on
     * screen.
     */
    const generous: CheckoutDataSource = {
      quote: (selections: Selections) =>
        Promise.resolve({
          ok: true,
          quote: selections.bumps.includes("bump")
            ? {
                ...quoteOf(true),
                lineItems: [
                  {
                    nodeId: "bump",
                    kind: "bump" as const,
                    label: "Gift wrapping",
                    quantity: 1,
                    unitAmount: 100,
                    amount: 100,
                  },
                ],
              }
            : quoteOf(false),
        }),
    }

    render(page(generous, { price: 499 }))

    await waitFor(() => expect(total()).toBe("£19.99"))

    await userEvent.click(offer())

    expect(await screen.findByText("£1.00")).toBeVisible()
    expect(screen.queryByText("£4.99")).toBeNull()
  })

  it("marks itself as taken, in more than a tick", async () => {
    render(page(priced()))

    await waitFor(() => expect(total()).toBe("£19.99"))

    await userEvent.click(offer())

    await waitFor(() => expect(offer()).toBeChecked())
    expect(document.querySelector(".ck-bump-on")).not.toBeNull()
  })

  it("can be taken from the keyboard", async () => {
    render(page(priced()))

    await waitFor(() => expect(total()).toBe("£19.99"))

    offer().focus()
    await userEvent.keyboard(" ")

    await waitFor(() => expect(total()).toBe("£24.98"))
  })
})

describe("changing your mind", () => {
  it("puts the total back", async () => {
    render(page(priced()))

    await waitFor(() => expect(total()).toBe("£19.99"))

    await userEvent.click(offer())
    await waitFor(() => expect(total()).toBe("£24.98"))

    await userEvent.click(offer())

    await waitFor(() => expect(total()).toBe("£19.99"))
    expect(offer()).not.toBeChecked()
  })

  it("takes it out of the cart entirely", async () => {
    const asked = vi.fn((selections: Selections) =>
      Promise.resolve({ ok: true, quote: quoteOf(selections.bumps.includes("bump")) } as const),
    )

    render(page({ quote: asked }))

    await waitFor(() => expect(total()).toBe("£19.99"))

    await userEvent.click(offer())
    await waitFor(() => expect(asked).toHaveBeenCalledTimes(2))

    await userEvent.click(offer())

    await waitFor(() => expect(asked.mock.calls.at(-1)?.[0].bumps).toEqual([]))
  })

  it("does not re-quote when the answer is already the answer", async () => {
    /*
     * Toggling to the state it is already in built a new selections object out
     * of an unchanged array — a filter that removes nothing still returns a new
     * array — and the quote effect cannot tell that from a real change.
     */
    const asked = vi.fn((selections: Selections) =>
      Promise.resolve({ ok: true, quote: quoteOf(selections.bumps.includes("bump")) } as const),
    )

    render(
      <CheckoutProvider source={{ quote: asked }} initialItems={[{ nodeId: "prod", quantity: 1 }]}>
        <p>x</p>
      </CheckoutProvider>,
    )

    await waitFor(() => expect(asked).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => {
      setTimeout(resolve, 20)
    })

    expect(asked).toHaveBeenCalledTimes(1)
  })
})

describe("axe", () => {
  it("reports nothing before or after it is taken", async () => {
    const { container } = render(page(priced(), { image: "https://cdn.test/box.png" }))

    await waitFor(() => expect(total()).toBe("£19.99"))
    await expectNoViolations(container)

    await userEvent.click(offer())
    await waitFor(() => expect(total()).toBe("£24.98"))
    await expectNoViolations(container)
  })
})
