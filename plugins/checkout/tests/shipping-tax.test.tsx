import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactElement, ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { CheckoutProvider } from "../src/checkout/CheckoutProvider"
import type { CheckoutDataSource, Quote, QuoteLineItem, Selections } from "../src/checkout/source"
import { shippingSelector } from "../src/components/shipping-selector/definition"
import { taxSummary } from "../src/components/tax-summary/definition"
import { expectNoViolations } from "./axe"
import { nodeOf } from "./support"

const METHODS = [
  { id: "std", label: "Standard", amount: 0, description: "Three to five days" },
  { id: "exp", label: "Express", amount: 599, description: "Next working day" },
]

function quoteOf(overrides: Partial<Quote> = {}): Quote {
  return {
    quoteId: "qt_1",
    signature: "sig",
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    currency: "GBP",
    lineItems: [],
    subtotal: 1999,
    discount: 0,
    shipping: 0,
    tax: 0,
    total: 1999,
    notices: [],
    ...overrides,
  }
}

function taxLine(nodeId: string, label: string, amount: number): QuoteLineItem {
  return { nodeId, kind: "tax", label, quantity: 1, unitAmount: amount, amount }
}

/** One component, inside a checkout that answers from memory. */
function mount(
  definition: typeof shippingSelector,
  source: CheckoutDataSource,
  props: Record<string, unknown> = {},
): ReactElement {
  const Renderer = definition.renderer

  return (
    <CheckoutProvider source={source} initialItems={[{ nodeId: "prod", quantity: 1 }]}>
      <Renderer
        node={nodeOf(definition.type, { id: "node" })}
        props={{ ...definition.defaultProps, ...props }}
        className="ck-test"
        mode="published"
      >
        {null as ReactNode}
      </Renderer>
    </CheckoutProvider>
  )
}

/** Prices the chosen method, and says which one it priced. */
function shipping(): CheckoutDataSource {
  return {
    quote: (selections: Selections) => {
      const id = selections.shippingMethodId ?? "std"
      const method = METHODS.find((candidate) => candidate.id === id) ?? METHODS[0]

      return Promise.resolve({
        ok: true,
        quote: quoteOf({
          shippingMethods: METHODS,
          shippingMethodId: id,
          shipping: method?.amount ?? 0,
          total: 1999 + (method?.amount ?? 0),
        }),
      })
    },
  }
}

describe("choosing how it arrives", () => {
  it("is a named group of radios, so it can be moved through with arrow keys", async () => {
    render(mount(shippingSelector, shipping()))

    const group = await screen.findByRole("group", { name: "Delivery" })

    expect(within(group).getAllByRole("radio")).toHaveLength(2)
  })

  it("shows each method, what it costs, and when it arrives", async () => {
    render(mount(shippingSelector, shipping()))

    expect(await screen.findByText("Express")).toBeVisible()
    expect(screen.getByText("Next working day")).toBeVisible()
    expect(screen.getByText("£5.99")).toBeVisible()
  })

  it("says Free rather than nothing at all", async () => {
    // "£0.00" beside a delivery method reads as a price somebody is paying.
    render(mount(shippingSelector, shipping()))

    expect(await screen.findByText("Free")).toBeVisible()
  })

  it("takes the merchant's word for free", async () => {
    render(mount(shippingSelector, shipping(), { freeLabel: "No charge" }))

    expect(await screen.findByText("No charge")).toBeVisible()
  })

  it("ticks the method the quote was priced with", async () => {
    render(mount(shippingSelector, shipping()))

    await waitFor(() => expect(screen.getByRole("radio", { name: /Standard/ })).toBeChecked())
  })

  it("asks the server again when another is chosen", async () => {
    const asked = vi.fn(shipping().quote)

    render(mount(shippingSelector, { quote: asked }))

    await waitFor(() => expect(screen.getByRole("radio", { name: /Express/ })).not.toBeChecked())

    await userEvent.click(screen.getByRole("radio", { name: /Express/ }))

    await waitFor(() => expect(asked.mock.calls.at(-1)?.[0].shippingMethodId).toBe("exp"))
    await waitFor(() => expect(screen.getByRole("radio", { name: /Express/ })).toBeChecked())
  })

  it("does not tick a method the total has not been told about", async () => {
    /*
     * The tick follows the quote, not the click. Following the click would put
     * a mark beside Express while the amount next to it still described
     * Standard — and the one thing a checkout may never do is show a number
     * that is not the one being charged.
     */
    let settle = (): void => undefined
    const slow: CheckoutDataSource = {
      quote: vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          quote: quoteOf({ shippingMethods: METHODS, shippingMethodId: "std" }),
        })
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              settle = () => {
                resolve({
                  ok: true,
                  quote: quoteOf({
                    shippingMethods: METHODS,
                    shippingMethodId: "exp",
                    shipping: 599,
                  }),
                })
              }
            }),
        ),
    }

    render(mount(shippingSelector, slow))

    await waitFor(() => expect(screen.getByRole("radio", { name: /Standard/ })).toBeChecked())

    await userEvent.click(screen.getByRole("radio", { name: /Express/ }))

    // Still Standard, and the group says it is working.
    expect(screen.getByRole("radio", { name: /Standard/ })).toBeChecked()
    await waitFor(() =>
      expect(screen.getByRole("group", { name: "Delivery" })).toHaveAttribute("aria-busy", "true"),
    )

    settle()

    await waitFor(() => expect(screen.getByRole("radio", { name: /Express/ })).toBeChecked())
  })

  it("says so when there is nothing to choose from", async () => {
    render(
      mount(shippingSelector, { quote: () => Promise.resolve({ ok: true, quote: quoteOf() }) }),
    )

    expect(await screen.findByText(/Delivery options appear/)).toBeVisible()
    expect(screen.queryByRole("radio")).toBeNull()
  })

  it("renders outside a checkout rather than throwing", () => {
    const Renderer = shippingSelector.renderer

    expect(() =>
      render(
        <Renderer
          node={nodeOf(shippingSelector.type, { id: "node" })}
          props={shippingSelector.defaultProps}
          className="ck-test"
          mode="editor-preview"
        >
          {null as ReactNode}
        </Renderer>,
      ),
    ).not.toThrow()
  })

  it("invents no example methods for the canvas", () => {
    // A merchant who styles a page against invented options is styling a page
    // they will never see.
    const Renderer = shippingSelector.renderer
    const { container } = render(
      <Renderer
        node={nodeOf(shippingSelector.type, { id: "node" })}
        props={shippingSelector.defaultProps}
        className="ck-test"
        mode="editor-preview"
      >
        {null as ReactNode}
      </Renderer>,
    )

    expect(container.querySelectorAll("input")).toHaveLength(0)
  })
})

describe("what tax was charged", () => {
  function tax(overrides: Partial<Quote>): CheckoutDataSource {
    return { quote: () => Promise.resolve({ ok: true, quote: quoteOf(overrides) }) }
  }

  it("lists the server's own breakdown", async () => {
    render(
      mount(
        taxSummary,
        tax({
          tax: 700,
          lineItems: [taxLine("vat", "VAT 20%", 400), taxLine("city", "City tax", 300)],
        }),
      ),
    )

    expect(await screen.findByText("VAT 20%")).toBeVisible()
    expect(screen.getByText("£4.00")).toBeVisible()
    expect(screen.getByText("City tax")).toBeVisible()
    expect(screen.getByText("£3.00")).toBeVisible()
  })

  it("adds nothing up", async () => {
    /*
     * The lines come to £7.00 and the quote's own tax figure is £9.99. A
     * component that totalled its rows would print a number nobody is
     * remitting; this one prints the rows it was given and no total at all.
     */
    render(
      mount(
        taxSummary,
        tax({
          tax: 999,
          lineItems: [taxLine("vat", "VAT 20%", 400), taxLine("city", "City tax", 300)],
        }),
      ),
    )

    await waitFor(() => expect(screen.getByText("VAT 20%")).toBeVisible())
    expect(screen.queryByText("£7.00")).toBeNull()
  })

  it("falls back to the single figure when the server sent no breakdown", async () => {
    render(mount(taxSummary, tax({ tax: 480 })))

    expect(await screen.findByText("£4.80")).toBeVisible()
    expect(screen.getByText("Tax")).toBeVisible()
  })

  it("says nothing at all when there is no tax", async () => {
    const { container } = render(mount(taxSummary, tax({ tax: 0 })))

    await waitFor(() => expect(container.querySelector("[data-ck-tax-empty]")).not.toBeNull())
    expect(container.querySelector("dl")).toBeNull()
  })

  it("says zero when the merchant asks it to", async () => {
    render(mount(taxSummary, tax({ tax: 0 }), { hideWhenZero: false }))

    expect(await screen.findByText("£0.00")).toBeVisible()
  })

  it("takes the merchant's label and note", async () => {
    render(mount(taxSummary, tax({ tax: 480 }), { label: "VAT", note: "Charged at the UK rate." }))

    expect(await screen.findByText("VAT")).toBeVisible()
    expect(screen.getByText("Charged at the UK rate.")).toBeVisible()
  })

  it("is read as terms and amounts", async () => {
    render(mount(taxSummary, tax({ tax: 480 })))

    await waitFor(() => expect(screen.getAllByRole("term")).toHaveLength(1))
    expect(screen.getAllByRole("definition")).toHaveLength(1)
  })

  it("renders outside a checkout rather than throwing", () => {
    const Renderer = taxSummary.renderer

    expect(() =>
      render(
        <Renderer
          node={nodeOf(taxSummary.type, { id: "node" })}
          props={taxSummary.defaultProps}
          className="ck-test"
          mode="editor-preview"
        >
          {null as ReactNode}
        </Renderer>,
      ),
    ).not.toThrow()
  })
})

describe("axe", () => {
  it("reports nothing for a set of delivery options", async () => {
    const { container } = render(mount(shippingSelector, shipping()))

    await waitFor(() => expect(screen.getByText("Express")).toBeVisible())
    await expectNoViolations(container)
  })

  it("reports nothing for a tax breakdown with a note", async () => {
    const { container } = render(
      mount(
        taxSummary,
        {
          quote: () =>
            Promise.resolve({
              ok: true,
              quote: quoteOf({ tax: 400, lineItems: [taxLine("vat", "VAT 20%", 400)] }),
            }),
        },
        { note: "Charged at the UK rate." },
      ),
    )

    await waitFor(() => expect(screen.getByText("VAT 20%")).toBeVisible())
    await expectNoViolations(container)
  })
})
