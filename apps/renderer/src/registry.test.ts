import { describe, expect, it } from "vitest"

import { host, registry } from "./registry"

/**
 * That the plugins are actually installed in the build a customer loads.
 *
 * The studio has had this test since `core-layout` arrived and the renderer
 * application has not, which is the wrong way round: a plugin missing here is
 * a published checkout rendering unsupported placeholders to somebody holding
 * a card, and every test in every plugin would still pass. Same shape as the
 * benchmark that spent two phases measuring fixture components.
 *
 * What it is not testing is `PluginHost`, which has its own tests. It is
 * testing that this application wires it up.
 */
describe("the published registry", () => {
  it("activated every core plugin", () => {
    expect(host.records().map((record) => [record.manifest.id, record.state])).toEqual([
      ["core-layout", "active"],
      ["core-content", "active"],
      ["core-embed", "active"],
      ["core-forms", "active"],
      ["checkout", "active"],
    ])
  })

  it("resolves the root type every document already has", () => {
    expect(registry.get("core.page")?.name).toBe("Page")
  })

  it("holds the same types the editor draws with", () => {
    // Not an exhaustive list: the point is that all three plugins reached it,
    // and the catalog in docs/component-library.md is the list.
    for (const type of [
      "core.section",
      "core.heading",
      "core.button",
      "core.html-block",
      "core.input",
      "core.select",
      "core.address",
      /*
       * A Product Card is interactive for a reason the form fields are not: it
       * is what puts its product in the cart, from an effect. A card rendered
       * only on the server would be a product nothing is being asked to price.
       */
      "checkout.product-card",
      "checkout.order-summary",
      // Somebody types into it, and what they typed has to be remembered,
      // sent, and answered.
      "checkout.coupon",
      // Somebody ticks it, and the cart changes.
      "checkout.order-bump",
      // Both read a quote that lands after the page does; the selector also
      // changes the cart.
      "checkout.shipping-selector",
      "checkout.tax-summary",
    ]) {
      expect(registry.has(type), type).toBe(true)
    }
  })

  it("ships a client only for the components that cannot do without one", () => {
    /*
     * This asserted an empty list until Phase 10, and said that when the first
     * interactive component arrived it should say so rather than be deleted.
     * It is the form fields: somebody types into one, and what they typed has
     * to be remembered, checked and shown back.
     *
     * The list is named rather than counted, because what matters is *which*
     * components spend the published bundle's budget. `pnpm renderer:bundle`
     * measures the cost; this says who is allowed to incur it.
     */
    const interactive = registry.types().filter((type) => registry.get(type)?.interactive === true)

    expect(interactive).toEqual([
      "core.input",
      "core.textarea",
      "core.select",
      "core.checkbox",
      "core.radio-group",
      "core.country",
      "core.address",
      /*
       * A Product Card is interactive for a reason the form fields are not: it
       * is what puts its product in the cart, from an effect. A card rendered
       * only on the server would be a product nothing is being asked to price.
       */
      "checkout.product-card",
      "checkout.order-summary",
      // Somebody types into it, and what they typed has to be remembered,
      // sent, and answered.
      "checkout.coupon",
      // Somebody ticks it, and the cart changes.
      "checkout.order-bump",
      // Both read a quote that lands after the page does; the selector also
      // changes the cart.
      "checkout.shipping-selector",
      "checkout.tax-summary",
    ])
  })
})
