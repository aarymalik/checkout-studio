import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactElement, ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { CheckoutProvider } from "../src/checkout/CheckoutProvider"
import type { CheckoutDataSource, Quote, Selections } from "../src/checkout/source"
import { coupon } from "../src/components/coupon/definition"
import { orderSummary } from "../src/components/order-summary/definition"
import { productCard } from "../src/components/product-card/definition"
import { expectNoViolations } from "./axe"
import { nodeOf } from "./support"

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

/** A page with a product, a coupon field and a summary. */
function page(source: CheckoutDataSource, props: Record<string, unknown> = {}): ReactElement {
  const Card = productCard.renderer
  const Coupon = coupon.renderer
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
      <Coupon
        node={nodeOf("checkout.coupon", { id: "cpn" })}
        props={{ ...coupon.defaultProps, ...props }}
        className="ck-coupon"
        mode="published"
      >
        {null as ReactNode}
      </Coupon>
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

/** The summary's total, by name — three things show amounts on this page. */
function total(): string {
  const row = document.querySelector('[data-ck-summary-row="total"]')

  return row === null ? "" : (within(row as HTMLElement).getByRole("definition").textContent ?? "")
}

/** Answers yes to everything, with a discount once a code is sent. */
function accepting(): CheckoutDataSource {
  return {
    quote: (selections: Selections) =>
      Promise.resolve({
        ok: true,
        quote:
          selections.couponCode === undefined ? quoteOf() : quoteOf({ discount: 500, total: 1499 }),
      }),
  }
}

/** Refuses any code, and prices the cart without one. */
function refusing(message = "That code has expired."): CheckoutDataSource {
  return {
    quote: (selections: Selections) =>
      Promise.resolve(
        selections.couponCode === undefined
          ? { ok: true, quote: quoteOf() }
          : {
              ok: false,
              problem: {
                code: "coupon-rejected",
                message,
                couponCode: selections.couponCode,
              },
            },
      ),
  }
}

describe("a coupon field", () => {
  it("asks for a code and offers to send it", async () => {
    render(page(accepting()))

    await waitFor(() => expect(total()).toBe("£19.99"))

    expect(screen.getByLabelText("Discount code")).toBeInstanceOf(HTMLInputElement)
    expect(screen.getByRole("button", { name: "Apply" })).toBeVisible()
  })

  it("takes the merchant's own words", async () => {
    render(
      page(accepting(), {
        label: "Promo",
        placeholder: "WELCOME10",
        buttonLabel: "Redeem",
      }),
    )

    await waitFor(() => expect(total()).toBe("£19.99"))

    expect(screen.getByLabelText("Promo")).toHaveAttribute("placeholder", "WELCOME10")
    expect(screen.getByRole("button", { name: "Redeem" })).toBeVisible()
  })

  it("renders outside a checkout rather than throwing", () => {
    // A component on a canvas has no checkout around it yet.
    const Coupon = coupon.renderer

    expect(() =>
      render(
        <Coupon
          node={nodeOf("checkout.coupon", { id: "cpn" })}
          props={coupon.defaultProps}
          className="ck-coupon"
          mode="editor-preview"
        >
          {null as ReactNode}
        </Coupon>,
      ),
    ).not.toThrow()
  })
})

describe("sending a code", () => {
  it("sends exactly what was typed, and decides nothing about it", async () => {
    /*
     * No client-side validation, deliberately. Whether a code exists, has
     * expired or has been spent is in docs/stripe-integration.md and all of it
     * is the server's — a discount a browser could decide is a discount
     * anybody can award themselves.
     */
    const asked = vi.fn().mockResolvedValue({ ok: true, quote: quoteOf() })

    render(page({ quote: asked }))

    await waitFor(() => expect(asked).toHaveBeenCalled())

    await userEvent.type(screen.getByLabelText("Discount code"), "  ???nonsense  ")
    await userEvent.click(screen.getByRole("button", { name: "Apply" }))

    await waitFor(() =>
      expect(asked.mock.calls.at(-1)?.[0]).toMatchObject({ couponCode: "???nonsense" }),
    )
  })

  it("sends nothing when nothing was typed", async () => {
    const asked = vi.fn().mockResolvedValue({ ok: true, quote: quoteOf() })

    render(page({ quote: asked }))

    await waitFor(() => expect(asked).toHaveBeenCalledTimes(1))

    await userEvent.click(screen.getByRole("button", { name: "Apply" }))

    expect(asked).toHaveBeenCalledTimes(1)
  })

  it("does not submit the order when somebody presses Enter", async () => {
    /*
     * A coupon sits inside the checkout's form, and Enter in a text field
     * submits it. Without this, finishing a discount code buys the thing.
     */
    const submitted = vi.fn((event: { preventDefault: () => void }) => {
      event.preventDefault()
    })
    const asked = vi.fn().mockResolvedValue({ ok: true, quote: quoteOf() })

    render(<form onSubmit={submitted}>{page({ quote: asked })}</form>)

    await waitFor(() => expect(asked).toHaveBeenCalled())

    await userEvent.type(screen.getByLabelText("Discount code"), "SAVE10{Enter}")

    await waitFor(() =>
      expect(asked.mock.calls.at(-1)?.[0]).toMatchObject({ couponCode: "SAVE10" }),
    )
    expect(submitted).not.toHaveBeenCalled()
  })
})

describe("while the server is deciding", () => {
  it("says so, and will not send the same code twice", async () => {
    let settle = (): void => undefined
    const asked = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, quote: quoteOf() })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            settle = () => {
              resolve({ ok: true, quote: quoteOf({ discount: 500, total: 1499 }) })
            }
          }),
      )

    render(page({ quote: asked }))

    await waitFor(() => expect(total()).toBe("£19.99"))

    await userEvent.type(screen.getByLabelText("Discount code"), "SAVE10")
    await userEvent.click(screen.getByRole("button", { name: "Apply" }))

    const button = await screen.findByRole("button", { name: "Apply" })

    await waitFor(() => expect(button).toHaveAttribute("aria-disabled", "true"))
    expect(await screen.findByText("Checking that code…")).toBeVisible()

    // Pressing it again while it waits is not a second request.
    await userEvent.click(button)
    expect(asked).toHaveBeenCalledTimes(2)

    settle()
    await waitFor(() => expect(total()).toBe("£14.99"))
  })
})

describe("a code the server accepts", () => {
  it("shows the code, what it took off, and a way to undo it", async () => {
    render(page(accepting()))

    await waitFor(() => expect(total()).toBe("£19.99"))

    await userEvent.type(screen.getByLabelText("Discount code"), "SAVE5")
    await userEvent.click(screen.getByRole("button", { name: "Apply" }))

    expect(await screen.findByText("SAVE5")).toBeVisible()

    // Scoped: the summary's discount row shows the same amount.
    const field = document.querySelector(".ck-coupon") as HTMLElement

    expect(within(field).getByText("-£5.00")).toBeVisible()
    expect(screen.getByRole("button", { name: "Remove" })).toBeVisible()
    expect(screen.getByRole("status")).toHaveTextContent("Discount applied.")
    expect(total()).toBe("£14.99")
  })

  it("puts the total back when the coupon is removed", async () => {
    render(page(accepting()))

    await waitFor(() => expect(total()).toBe("£19.99"))

    await userEvent.type(screen.getByLabelText("Discount code"), "SAVE5")
    await userEvent.click(screen.getByRole("button", { name: "Apply" }))
    await waitFor(() => expect(total()).toBe("£14.99"))

    await userEvent.click(screen.getByRole("button", { name: "Remove" }))

    await waitFor(() => expect(total()).toBe("£19.99"))
    expect(screen.getByLabelText("Discount code")).toHaveValue("")
  })

  it("says the merchant's own thank you", async () => {
    render(page(accepting(), { successMessage: "Nice one." }))

    await waitFor(() => expect(total()).toBe("£19.99"))

    await userEvent.type(screen.getByLabelText("Discount code"), "SAVE5")
    await userEvent.click(screen.getByRole("button", { name: "Apply" }))

    expect(await screen.findByText("Nice one.")).toBeVisible()
  })
})

describe("a code the server refuses", () => {
  it("keeps the total, because the cart did not change", async () => {
    /*
     * The rule this slice turns on. A refused coupon is not a failed quote:
     * nothing was applied, so the number already on screen still describes the
     * order. Blanking it would lose a correct total because somebody mistyped
     * a word.
     */
    render(page(refusing()))

    await waitFor(() => expect(total()).toBe("£19.99"))

    await userEvent.type(screen.getByLabelText("Discount code"), "EXPIRED")
    await userEvent.click(screen.getByRole("button", { name: "Apply" }))

    expect(await screen.findByText("That code has expired.")).toBeVisible()
    await waitFor(() => expect(total()).toBe("£19.99"))
  })

  it("says why, where the field is described", async () => {
    render(page(refusing("That code is for new customers.")))

    await waitFor(() => expect(total()).toBe("£19.99"))

    await userEvent.type(screen.getByLabelText("Discount code"), "NEW50")
    await userEvent.click(screen.getByRole("button", { name: "Apply" }))

    const field = await screen.findByLabelText("Discount code")

    await waitFor(() => expect(field).toHaveAttribute("aria-invalid", "true"))

    const describedBy = field.getAttribute("aria-describedby") ?? ""

    expect(document.getElementById(describedBy)).toHaveTextContent(
      "That code is for new customers.",
    )
  })

  it("falls back to the merchant's sentence when the server gives none", async () => {
    render(page(refusing(""), { validationMessage: "We could not use that code." }))

    await waitFor(() => expect(total()).toBe("£19.99"))

    await userEvent.type(screen.getByLabelText("Discount code"), "NOPE")
    await userEvent.click(screen.getByRole("button", { name: "Apply" }))

    expect(await screen.findByText("We could not use that code.")).toBeVisible()
  })

  it("takes the refused code out, so the next quote is not refused for it", async () => {
    /*
     * Leaving it in the selections would mean the next change to the cart —
     * a quantity, a bump — asked for a price with a code the server has
     * already said no to, and the whole quote would fail.
     */
    const asked = vi.fn((selections: Selections) =>
      Promise.resolve(
        selections.couponCode === undefined
          ? ({ ok: true, quote: quoteOf() } as const)
          : ({
              ok: false,
              problem: { code: "coupon-rejected" as const, message: "No." },
            } as const),
      ),
    )

    render(page({ quote: asked }))

    await waitFor(() => expect(total()).toBe("£19.99"))

    await userEvent.type(screen.getByLabelText("Discount code"), "NOPE")
    await userEvent.click(screen.getByRole("button", { name: "Apply" }))

    expect(await screen.findByText("No.")).toBeVisible()

    await waitFor(() => expect(asked.mock.calls.at(-1)?.[0].couponCode).toBeUndefined())
  })

  it("leaves what was typed, so it can be corrected rather than retyped", async () => {
    render(page(refusing()))

    await waitFor(() => expect(total()).toBe("£19.99"))

    await userEvent.type(screen.getByLabelText("Discount code"), "SAVE1O")
    await userEvent.click(screen.getByRole("button", { name: "Apply" }))

    expect(await screen.findByText("That code has expired.")).toBeVisible()
    expect(screen.getByLabelText("Discount code")).toHaveValue("SAVE1O")
  })
})

describe("axe", () => {
  it("reports nothing while idle", async () => {
    const { container } = render(page(accepting()))

    await waitFor(() => expect(total()).toBe("£19.99"))
    await expectNoViolations(container)
  })

  it("reports nothing once a code is refused", async () => {
    const { container } = render(page(refusing()))

    await waitFor(() => expect(total()).toBe("£19.99"))

    await userEvent.type(screen.getByLabelText("Discount code"), "EXPIRED")
    await userEvent.click(screen.getByRole("button", { name: "Apply" }))

    expect(await screen.findByText("That code has expired.")).toBeVisible()
    await expectNoViolations(container)
  })
})
