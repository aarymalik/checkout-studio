import { createDocument } from "@checkout-studio/schema"
import type { CheckoutSchema, Node } from "@checkout-studio/schema"
import { describe, expect, it } from "vitest"

import {
  cartWithoutProduct,
  checkoutValidators,
  duplicateCoupon,
  totalWithoutProduct,
} from "../src/validators"
import { nodeOf } from "./support"

/** A page holding these component types, in this order. */
function pageOf(types: readonly string[]): CheckoutSchema {
  const base = createDocument({
    projectId: "prj_t",
    pageId: "pag_t",
    themeId: "theme_default",
    random: () => 0.5,
  })
  const root = base.nodes[base.root] as Node
  const nodes: Record<string, Node> = { ...base.nodes }
  const ids = types.map((type, index) => `${type}-${String(index)}`)

  types.forEach((type, index) => {
    const id = ids[index] as string

    nodes[id] = { ...nodeOf(type, { id }), parentId: base.root }
  })

  return {
    ...base,
    nodes: { ...nodes, [base.root]: { ...root, children: ids } },
  }
}

describe("a page with nothing for sale", () => {
  it.each(["checkout.coupon", "checkout.order-bump", "checkout.shipping-selector"])(
    "refuses to publish one carrying a %s",
    (type) => {
      /*
       * A control wired to nothing. A coupon accepts a code and applies it to
       * no order; a bump offers to add something to an order nobody can place.
       */
      const [issue] = cartWithoutProduct.validate(pageOf([type]))

      expect(issue?.severity).toBe("error")
      expect(issue?.message).toMatch(/nothing for sale/)
      expect(issue?.nodeIds).toEqual([`${type}-0`])
    },
  )

  it("names every one of them, once each", () => {
    const issues = cartWithoutProduct.validate(
      pageOf(["checkout.coupon", "checkout.coupon", "checkout.order-bump"]),
    )

    expect(issues[0]?.message).toContain("coupon, order-bump")
    expect(issues[0]?.nodeIds).toHaveLength(3)
  })

  it.each(["checkout.order-summary", "checkout.tax-summary"])(
    "only warns about a %s, because it is not broken",
    (type) => {
      /*
       * A summary with an empty cart says the order is empty, which is true.
       * It is a page the merchant probably did not mean to publish, not a page
       * that would mislead anybody.
       */
      const [issue] = totalWithoutProduct.validate(pageOf([type]))

      expect(issue?.severity).toBe("warning")
      expect(issue?.message).toMatch(/order is empty/)
    },
  )

  it("says nothing at all when the page holds no checkout components", () => {
    // A landing page is not a broken checkout.
    const page = pageOf(["marketing.countdown", "core.heading"])

    expect(cartWithoutProduct.validate(page)).toEqual([])
    expect(totalWithoutProduct.validate(page)).toEqual([])
  })
})

describe("a page with something for sale", () => {
  it("is content with a cart and the things that change it", () => {
    const page = pageOf([
      "checkout.product-card",
      "checkout.coupon",
      "checkout.order-bump",
      "checkout.shipping-selector",
      "checkout.order-summary",
      "checkout.tax-summary",
    ])

    expect(cartWithoutProduct.validate(page)).toEqual([])
    expect(totalWithoutProduct.validate(page)).toEqual([])
  })

  it("counts a product anywhere on the page, not only beside the summary", () => {
    const page = pageOf(["checkout.order-summary", "checkout.product-card"])

    expect(totalWithoutProduct.validate(page)).toEqual([])
  })
})

describe("two coupon fields", () => {
  it("are a warning, because the second silently replaces the first", () => {
    /*
     * Both write the same code into the same selections, so a customer who
     * types into one and then the other sees one of the two fields apparently
     * do nothing.
     */
    const [issue] = duplicateCoupon.validate(
      pageOf(["checkout.product-card", "checkout.coupon", "checkout.coupon"]),
    )

    expect(issue?.severity).toBe("warning")
    expect(issue?.message).toContain("2 coupon fields")
    expect(issue?.nodeIds).toHaveLength(2)
  })

  it("count, however many there are", () => {
    const [issue] = duplicateCoupon.validate(
      pageOf(["checkout.product-card", "checkout.coupon", "checkout.coupon", "checkout.coupon"]),
    )

    expect(issue?.message).toContain("3 coupon fields")
  })

  it("are fine as one", () => {
    expect(duplicateCoupon.validate(pageOf(["checkout.product-card", "checkout.coupon"]))).toEqual(
      [],
    )
  })

  it("are fine as none", () => {
    expect(duplicateCoupon.validate(pageOf(["checkout.product-card"]))).toEqual([])
  })
})

describe("the set of rules", () => {
  it("is what the plugin registers", () => {
    expect(checkoutValidators).toHaveLength(3)
  })

  it("gives each a unique name under this plugin", () => {
    const rules = checkoutValidators.map((validator) => validator.rule)

    expect(new Set(rules).size).toBe(rules.length)

    for (const rule of rules) expect(rule.startsWith("checkout.")).toBe(true)
  })

  it("labels each one, because the publish list shows them", () => {
    for (const validator of checkoutValidators) {
      expect(validator.label.length).toBeGreaterThan(0)
    }
  })

  it("stamps every issue with the rule that raised it", () => {
    const page = pageOf(["checkout.coupon", "checkout.coupon", "checkout.order-summary"])

    for (const validator of checkoutValidators) {
      for (const issue of validator.validate(page)) {
        expect(issue.rule).toBe(validator.rule)
      }
    }
  })
})
