import { render, screen, waitFor, within } from "@testing-library/react"
import type { ReactElement, ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { CheckoutProvider } from "../src/checkout/CheckoutProvider"
import type { CheckoutDataSource, Quote, QuoteLineItem, QuoteResult } from "../src/checkout/source"
import { orderSummary } from "../src/components/order-summary/definition"
import { productCard } from "../src/components/product-card/definition"
import { productList } from "../src/components/product-list/definition"
import { expectNoViolations } from "./axe"
import { nodeOf } from "./support"

function quoteOf(lineItems: readonly QuoteLineItem[], overrides: Partial<Quote> = {}): Quote {
  return {
    quoteId: "qt_1",
    signature: "sig",
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    currency: "GBP",
    lineItems,
    subtotal: 1999,
    discount: 0,
    shipping: 0,
    tax: 0,
    total: 1999,
    notices: [],
    ...overrides,
  }
}

function lineOf(overrides: Partial<QuoteLineItem> = {}): QuoteLineItem {
  return {
    nodeId: "prod",
    kind: "product",
    label: "Product",
    quantity: 1,
    unitAmount: 1999,
    amount: 1999,
    ...overrides,
  }
}

function sourceOf(result: QuoteResult): CheckoutDataSource {
  return { quote: () => Promise.resolve(result) }
}

/** A card, with or without a checkout around it. */
function card(props: Record<string, unknown> = {}, source?: CheckoutDataSource): ReactElement {
  const Card = productCard.renderer
  const drawn = (
    <Card
      node={nodeOf("checkout.product-card", { id: "prod" })}
      props={{ ...productCard.defaultProps, ...props }}
      className="ck-test"
      mode="published"
    >
      {null as ReactNode}
    </Card>
  )

  return source === undefined ? drawn : <CheckoutProvider source={source}>{drawn}</CheckoutProvider>
}

/** What the card is showing, as text. */
function prices(): string {
  return screen.getByRole("article").textContent ?? ""
}

describe("a product on its own", () => {
  it("shows what the merchant wrote when there is no checkout around it", () => {
    // The editor's canvas. A card that needed a provider would be a card
    // nobody could see while they were building the page.
    render(card({ title: "Leather Wallet", description: "Full grain.", price: 4500 }))

    expect(screen.getByRole("heading", { name: "Leather Wallet" })).toBeVisible()
    expect(screen.getByText("Full grain.")).toBeVisible()
    expect(screen.getByText("£45.00")).toBeVisible()
  })

  it("takes the heading level the merchant chose", () => {
    // A card inside a section that already has an h2 needs an h3, and one
    // nested deeper needs an h4. A fixed level would break the outline of
    // every page that nests it differently.
    render(card({ title: "Wallet", headingLevel: "h5" }))

    expect(screen.getByRole("heading", { level: 5 })).toHaveTextContent("Wallet")
  })

  it("draws an authored price in the authored currency", () => {
    render(card({ price: 4500, currency: "JPY" }))

    // Zero-decimal: ¥4500 is four and a half thousand yen, not forty-five.
    expect(prices().replace(/\u00a0/g, " ")).toContain("JP¥4,500")
  })

  it("strikes the old price through when a sale price is set", () => {
    render(card({ price: 4500, salePrice: 2900 }))

    expect(screen.getByText("£29.00")).toBeVisible()
    expect(screen.getByText("£45.00").tagName).toBe("S")
  })

  it("strikes nothing through when the sale price is not a saving", () => {
    // A "sale" price above the list price is a mistake, and drawing it as a
    // reduction would advertise a discount that is not one.
    render(card({ price: 2900, salePrice: 4500 }))

    expect(screen.queryByText("£29.00")).toBeNull()
    expect(screen.getByText("£45.00").tagName).not.toBe("S")
  })

  it("shows a SKU when there is one, and nothing when there is not", () => {
    const { rerender } = render(card({ sku: "LW-01" }))

    expect(screen.getByText("SKU LW-01")).toBeVisible()

    rerender(card())
    expect(screen.queryByText(/SKU/)).toBeNull()
  })

  it.each([
    ["out of stock", 0, "Out of stock"],
    ["one left", 1, "Only 1 left"],
    ["a few left", 3, "Only 3 left"],
  ])("says when stock is %s", (_name, inventory, expected) => {
    render(card({ inventory }))

    expect(screen.getByText(expected)).toBeVisible()
  })

  it("says nothing about stock when there is plenty", () => {
    // "47 in stock" is not reassurance, it is noise — and a card that says it
    // about everything says nothing about the one product nearly gone.
    render(card({ inventory: 47 }))

    expect(screen.queryByText(/stock|left/i)).toBeNull()
  })

  it("respects a merchant's own idea of nearly gone", () => {
    render(card({ inventory: 9, lowStockAt: 10 }))

    expect(screen.getByText("Only 9 left")).toBeVisible()
  })

  it("leaves a picture undescribed when the title already describes it", () => {
    /*
     * The title is the next thing in the card, so a screen reader given alt
     * text as well hears the product named twice. An empty alt is what marks
     * a picture as decorative — it is not the same as having no alt at all.
     */
    render(card({ image: "https://cdn.test/wallet.png", title: "Wallet" }))

    expect(screen.getByRole("presentation", { hidden: true })).toHaveAttribute(
      "src",
      "https://cdn.test/wallet.png",
    )
  })

  it("describes a picture that says something the title does not", () => {
    render(card({ image: "https://cdn.test/wallet.png", imageAlt: "Open, showing card slots" }))

    expect(screen.getByAltText("Open, showing card slots")).toBeVisible()
  })
})

describe("a product inside a checkout", () => {
  it("shows the server's price rather than the merchant's", async () => {
    /*
     * The authored price is a preview; the quote's is what will be charged. A
     * card showing the other one would disagree with the bill, which is the
     * whole reason the quote exists.
     */
    render(
      card({ price: 4500 }, sourceOf({ ok: true, quote: quoteOf([lineOf({ unitAmount: 3900 })]) })),
    )

    await waitFor(() => expect(screen.getByText("£39.00")).toBeVisible())
    expect(screen.getByText("£45.00").tagName).toBe("S")
  })

  it("shows the server's line total and never works one out", async () => {
    /*
     * The line disagrees with itself: three at £10.00 is £30.00, and the
     * server says £25.00. A card that multiplied would show the number nobody
     * is charging. Phase 11: "no component computes a monetary amount".
     */
    render(
      card(
        { quantity: 3 },
        sourceOf({
          ok: true,
          quote: quoteOf([lineOf({ quantity: 3, unitAmount: 1000, amount: 2500 })]),
        }),
      ),
    )

    await waitFor(() => expect(screen.getByText("£25.00")).toBeVisible())
    expect(screen.queryByText("£30.00")).toBeNull()
  })

  it("draws its amounts in the quote's currency, whatever the prop says", async () => {
    render(
      card(
        { currency: "GBP" },
        sourceOf({ ok: true, quote: quoteOf([lineOf()], { currency: "EUR" }) }),
      ),
    )

    await waitFor(() => expect(screen.getByText("€19.99")).toBeVisible())
  })

  it("names each amount for somebody who cannot see which is which", async () => {
    /*
     * Read aloud, a row of bare figures is a lottery ticket. Each carries a
     * word that is placed outside the viewport rather than removed from the
     * document, so the card is heard as "Was £45.00, £39.00, quantity 3,
     * total £25.00".
     */
    render(
      card(
        { price: 4500, quantity: 3 },
        sourceOf({
          ok: true,
          quote: quoteOf([lineOf({ quantity: 3, unitAmount: 3900, amount: 2500 })]),
        }),
      ),
    )

    await waitFor(() => expect(screen.getByText("£39.00")).toBeVisible())

    const article = screen.getByRole("article")

    expect(within(article).getByText("Was")).toBeInTheDocument()
    expect(within(article).getByText("quantity")).toBeInTheDocument()
    expect(within(article).getByText("total")).toBeInTheDocument()
  })
})

describe("what puts a product in the cart", () => {
  it("is the card being on the page", async () => {
    // `CartItem.nodeId` is the node that put it there. Nothing else assembles
    // a cart, so nothing else can disagree with what the page shows.
    const asked = vi.fn().mockResolvedValue({ ok: true, quote: quoteOf([lineOf()]) })

    render(card({ quantity: 2 }, { quote: asked }))

    await waitFor(() => expect(asked).toHaveBeenCalled())

    expect(asked.mock.calls[0]?.[0]).toMatchObject({
      items: [{ nodeId: "prod", quantity: 2 }],
    })
  })

  it("asks once for one card, not twice", async () => {
    /*
     * The card registers from an effect, so the first render of any checkout
     * has an empty cart. Quoting it would be a round trip to price nothing,
     * followed by the real one — which is what the provider's empty-cart
     * check exists to prevent.
     */
    const asked = vi.fn().mockResolvedValue({ ok: true, quote: quoteOf([lineOf()]) })

    render(card({}, { quote: asked }))

    await waitFor(() => expect(asked).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => {
      setTimeout(resolve, 20)
    })

    expect(asked).toHaveBeenCalledTimes(1)
  })

  it("never sends an amount, whatever the merchant priced it at", async () => {
    const asked = vi.fn().mockResolvedValue({ ok: true, quote: quoteOf([lineOf()]) })

    render(card({ price: 4500 }, { quote: asked }))

    await waitFor(() => expect(asked).toHaveBeenCalled())

    // A browser that could send a total is a browser that can choose one.
    expect(JSON.stringify(asked.mock.calls[0]?.[0])).not.toMatch(/4500|amount|total|price/i)
  })
})

/** A card and a summary under one checkout. */
function order(source: CheckoutDataSource, props: Record<string, unknown> = {}): ReactElement {
  const Card = productCard.renderer
  const Summary = orderSummary.renderer

  return (
    <CheckoutProvider source={source}>
      <Card
        node={nodeOf("checkout.product-card", { id: "prod" })}
        props={{ ...productCard.defaultProps, ...props }}
        className="ck-card"
        mode="published"
      >
        {null as ReactNode}
      </Card>
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

/**
 * The summary's total, by name.
 *
 * A card and a summary on one page show the same amount in three places, so
 * `getByText("£19.99")` is ambiguous — and an ambiguous query that happens to
 * resolve is a test that will break for a reason nobody can read.
 */
function total(): string {
  const row = document.querySelector('[data-ck-summary-row="total"]')

  return row === null ? "" : (within(row as HTMLElement).getByRole("definition").textContent ?? "")
}

describe("a cart that changes", () => {
  it("keeps the old total on screen while a new one is worked out", async () => {
    /*
     * The gap the last slice named and could not close: asserting it needed
     * something that changes the cart, and a card's quantity is the first
     * thing that can.
     *
     * A total that vanishes every time somebody changes a quantity is a
     * checkout that flickers. What is never shown is a stale total presented
     * as final — `aria-busy` is how a screen reader and a stylesheet both
     * know which one they are looking at.
     */
    let settle = (): void => undefined
    const source: CheckoutDataSource = {
      quote: vi
        .fn()
        .mockResolvedValueOnce({ ok: true, quote: quoteOf([lineOf()], { total: 1999 }) })
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              settle = () => {
                resolve({ ok: true, quote: quoteOf([lineOf()], { total: 3998 }) })
              }
            }),
        ),
    }

    const { rerender } = render(order(source, { quantity: 1 }))

    await waitFor(() => expect(total()).toBe("£19.99"))

    rerender(order(source, { quantity: 2 }))

    // The old total, still there, and marked as being worked on.
    await waitFor(() => expect(document.querySelector("dl")).toHaveAttribute("aria-busy", "true"))

    expect(total()).toBe("£19.99")

    settle()

    await waitFor(() => expect(total()).toBe("£39.98"))
    expect(document.querySelector("dl")).not.toHaveAttribute("aria-busy")
  })

  it("says the order is empty when the last product goes", async () => {
    /*
     * "Working out your total" about an order with nothing in it is a summary
     * waiting for something that is never coming — the provider does not ask,
     * because an empty cart has no total to ask about.
     */
    const asked = vi.fn().mockResolvedValue({ ok: true, quote: quoteOf([lineOf()]) })
    const Summary = orderSummary.renderer
    // One object, reused: a fresh one each render is the footgun the
    // provider now holds its source in a ref to disarm, and a test that
    // supplied one would be testing that instead of what it says.
    const source: CheckoutDataSource = { quote: asked }

    const { rerender } = render(order(source))

    await waitFor(() => expect(total()).toBe("£19.99"))

    rerender(
      <CheckoutProvider source={source}>
        <Summary
          node={nodeOf("checkout.order-summary", { id: "sum" })}
          props={orderSummary.defaultProps}
          className="ck-summary"
          mode="published"
        >
          {null as ReactNode}
        </Summary>
      </CheckoutProvider>,
    )

    expect(await screen.findByText("Nothing in your order yet.")).toBeVisible()
    expect(asked).toHaveBeenCalledTimes(1)
  })
})

describe("a list of products", () => {
  function list(
    children: ReactNode,
    childIds: readonly string[],
    mode = "published",
  ): ReactElement {
    const List = productList.renderer

    return (
      <List
        node={nodeOf("checkout.product-list", { id: "list", children: [...childIds] })}
        props={productList.defaultProps}
        className="ck-list"
        mode={mode as "published"}
      >
        {children}
      </List>
    )
  }

  it("is a list, so a screen reader counts the products before reading them", () => {
    render(list([<p key="a">First</p>, <p key="b">Second</p>], ["a", "b"]))

    expect(screen.getByRole("list")).toBeVisible()
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
  })

  it("holds products and refuses everything else", () => {
    // The restriction is the whole of what it adds. Without it this is Grid
    // with a different name in the panel.
    expect(productList.allowedChildTypes).toEqual(["checkout.product-card"])
  })

  it("is tall enough to drop a card into while a page is being built", () => {
    const { container } = render(list(null, [], "editor-preview"))

    expect(container.querySelector("ul")).toHaveStyle({ minHeight: "64px" })
  })

  it("takes no space on a published page when it is empty", () => {
    // An empty list correctly takes no room in front of a customer. The height
    // is for the person building the page, who has to aim at it.
    const { container } = render(list(null, [], "published"))

    expect(container.querySelector("ul")?.getAttribute("style")).toBeNull()
  })

  it("ships no JavaScript", () => {
    expect(productList.interactive).toBe(false)
  })
})

describe("axe", () => {
  it("reports nothing for a card", async () => {
    const { container } = render(
      card(
        { image: "https://cdn.test/wallet.png", sku: "LW-01", inventory: 2, price: 4500 },
        sourceOf({ ok: true, quote: quoteOf([lineOf({ quantity: 2, unitAmount: 3900 })]) }),
      ),
    )

    await waitFor(() => expect(screen.getByText("£39.00")).toBeVisible())
    await expectNoViolations(container)
  })

  it("reports nothing for a list of cards", async () => {
    const List = productList.renderer
    const { container } = render(
      <List
        node={nodeOf("checkout.product-list", { id: "list", children: ["prod"] })}
        props={productList.defaultProps}
        className="ck-list"
        mode="published"
      >
        {card({ title: "Wallet" })}
      </List>,
    )

    await expectNoViolations(container)
  })
})
