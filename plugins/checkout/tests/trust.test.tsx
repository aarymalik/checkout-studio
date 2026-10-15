import { render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it } from "vitest"

import { guaranteeBox } from "../src/components/guarantee-box/definition"
import { TRUST_ICONS } from "../src/components/icons"
import { readBadges } from "../src/components/trust-badges/badges"
import { trustBadges } from "../src/components/trust-badges/definition"
import { expectNoViolations } from "./axe"
import { nodeOf, renderComponent } from "./support"

describe("what a merchant wrote, read as badges", () => {
  it("keeps the ones with words", () => {
    expect(
      readBadges([
        { icon: "lock", text: "Secure checkout" },
        { icon: "truck", text: "Tracked delivery" },
      ]),
    ).toEqual([
      { paths: TRUST_ICONS.lock, text: "Secure checkout" },
      { paths: TRUST_ICONS.truck, text: "Tracked delivery" },
    ])
  })

  it("drops one with no words at all", () => {
    // The words are the badge. An icon alone reassures nobody and is
    // announced as nothing.
    expect(readBadges([{ icon: "lock" }, { icon: "truck", text: "  " }])).toEqual([])
  })

  it("falls back to a tick for an icon it does not have", () => {
    expect(readBadges([{ icon: "unicorn", text: "Safe" }])[0]?.paths).toEqual(TRUST_ICONS.check)
  })

  it.each([
    ["nothing at all", undefined],
    ["a string", "lock"],
    ["an object", { icon: "lock" }],
    ["nonsense inside", [1, null, "x"]],
  ])("survives %s", (_name, value) => {
    // A page that stopped rendering because one row of reassurance was
    // malformed would lose the sale the rest of it was trying to make.
    expect(() => readBadges(value)).not.toThrow()
    expect(readBadges(value)).toEqual([])
  })

  it("trims what somebody typed", () => {
    expect(readBadges([{ icon: "lock", text: "  Secure  " }])[0]?.text).toBe("Secure")
  })
})

describe("a row of badges", () => {
  it("is a list, so it is counted before it is read", () => {
    renderComponent(trustBadges)

    expect(screen.getByRole("list")).toBeVisible()
    expect(screen.getAllByRole("listitem")).toHaveLength(3)
  })

  it("says something true before anybody edits it", () => {
    renderComponent(trustBadges)

    expect(screen.getByText("Secure checkout")).toBeVisible()
    expect(screen.getByText("Tracked delivery")).toBeVisible()
    expect(screen.getByText("Money-back guarantee")).toBeVisible()
  })

  it("hides its icons from a screen reader", () => {
    /*
     * Each badge carries its own words, so the glyph beside them repeats what
     * was just read. An icon that says the same thing as the text next to it
     * is noise read aloud.
     */
    const { container } = renderComponent(trustBadges)

    for (const svg of container.querySelectorAll("svg")) {
      expect(svg).toHaveAttribute("aria-hidden")
    }
  })

  it("takes the merchant's own badges", () => {
    renderComponent(trustBadges, { props: { badges: [{ icon: "card", text: "All cards taken" }] } })

    expect(screen.getAllByRole("listitem")).toHaveLength(1)
    expect(screen.getByText("All cards taken")).toBeVisible()
  })

  it("draws an empty list rather than nothing when there is nothing to say", () => {
    const { container } = renderComponent(trustBadges, { props: { badges: [] } })

    expect(container.querySelector("ul")).not.toBeNull()
    expect(screen.queryAllByRole("listitem")).toHaveLength(0)
  })

  it("ships no JavaScript", () => {
    expect(trustBadges.interactive).toBe(false)
  })
})

describe("a guarantee", () => {
  it("is a region with a name, so it can be found", () => {
    renderComponent(guaranteeBox)

    expect(screen.getByRole("complementary", { name: "30-day money-back guarantee" })).toBeVisible()
  })

  it("is not a heading", () => {
    /*
     * A guarantee is an aside, not a section. An h3 here would put it in the
     * page outline between the order and the payment, where somebody
     * navigating by headings meets it as though it were a step.
     */
    const { container } = renderComponent(guaranteeBox)

    expect(container.querySelector("h1, h2, h3, h4, h5, h6")).toBeNull()
  })

  it("takes the merchant's words", () => {
    renderComponent(guaranteeBox, {
      props: { title: "Free returns", description: "Any time in the first year." },
    })

    expect(screen.getByText("Free returns")).toBeVisible()
    expect(screen.getByText("Any time in the first year.")).toBeVisible()
  })

  it("leaves the description out when there is none", () => {
    const { container } = renderComponent(guaranteeBox, {
      props: { title: "Free returns", description: "" },
    })

    expect(container.querySelectorAll("p")).toHaveLength(1)
  })

  it("takes the merchant's icon, and a tick for one it does not have", () => {
    const { container } = renderComponent(guaranteeBox, { props: { icon: "lock", title: "Safe" } })
    const paths = [...container.querySelectorAll("path")].map((path) => path.getAttribute("d"))

    expect(paths).toEqual([...TRUST_ICONS.lock])

    const { container: fallback } = renderComponent(guaranteeBox, {
      props: { icon: "unicorn", title: "Safe" },
    })

    expect(fallback.querySelector("path")?.getAttribute("d")).toBe(TRUST_ICONS.check[0])
  })

  it("hides its icon from a screen reader, because the words are beside it", () => {
    const { container } = renderComponent(guaranteeBox)

    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden")
  })

  it("ships no JavaScript", () => {
    expect(guaranteeBox.interactive).toBe(false)
  })
})

describe("axe", () => {
  it("reports nothing for a row of badges", async () => {
    const { container } = renderComponent(trustBadges)

    await expectNoViolations(container)
  })

  it("reports nothing for a guarantee", async () => {
    const { container } = renderComponent(guaranteeBox)

    await expectNoViolations(container)
  })

  it("reports nothing for both together", async () => {
    const Badges = trustBadges.renderer
    const Guarantee = guaranteeBox.renderer
    const { container } = render(
      <div>
        <Badges
          node={nodeOf("checkout.trust-badges", { id: "badges" })}
          props={trustBadges.defaultProps}
          className="ck-badges"
          mode="published"
        >
          {null as ReactNode}
        </Badges>
        <Guarantee
          node={nodeOf("checkout.guarantee-box", { id: "guarantee" })}
          props={guaranteeBox.defaultProps}
          className="ck-guarantee"
          mode="published"
        >
          {null as ReactNode}
        </Guarantee>
      </div>,
    )

    expect(within(container).getByRole("list")).toBeVisible()
    await expectNoViolations(container)
  })
})
