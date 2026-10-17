import { screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { reviews } from "../src/components/reviews/definition"
import { ratingText } from "../src/components/stars"
import { testimonial } from "../src/components/testimonial/definition"
import { expectNoViolations } from "./axe"
import { renderComponent } from "./support"

function fill(container: HTMLElement): string {
  return (container.querySelector(".ck-stars-clip") as HTMLElement | null)?.style.width ?? ""
}

describe("a rating in words", () => {
  it("writes a whole number without a decimal nobody needs", () => {
    expect(ratingText(5)).toBe("5 out of 5")
  })

  it("keeps one decimal when there is one", () => {
    expect(ratingText(4.8)).toBe("4.8 out of 5")
  })

  it("says what it is out of when that is not five", () => {
    expect(ratingText(8, 10)).toBe("8 out of 10")
  })
})

describe("stars", () => {
  it("fills the share of the row the rating describes", () => {
    const { container } = renderComponent(reviews, { props: { rating: 4, max: 5, count: 0 } })

    expect(fill(container)).toBe("80%")
  })

  it("is drawn from paths rather than a font's idea of a star", () => {
    /*
     * "★" is a different shape in every font, so a baseline taken on macOS
     * would never match the same page drawn on Linux.
     */
    const { container } = renderComponent(reviews)

    expect(container.querySelectorAll("svg").length).toBe(10)
    expect(container.textContent).not.toContain("★")
  })

  it("is hidden from a screen reader, which is told the figure instead", () => {
    const { container } = renderComponent(reviews, { props: { rating: 4.8, max: 5, count: 0 } })

    expect(container.querySelector(".ck-stars")).toHaveAttribute("aria-hidden")
    expect(screen.getByText("4.8 out of 5")).toBeVisible()
  })

  it.each([
    ["above the maximum", 9, "100%"],
    ["below zero", -2, "0%"],
  ])("cannot be filled %s", (_name, rating, expected) => {
    const { container } = renderComponent(reviews, { props: { rating, max: 5, count: 0 } })

    expect(fill(container)).toBe(expected)
  })

  it("survives a maximum of nothing", () => {
    const { container } = renderComponent(reviews, { props: { rating: 3, max: 0, count: 0 } })

    expect(fill(container)).not.toContain("NaN")
  })
})

describe("a summary of reviews", () => {
  it("says how well, how many and where", () => {
    renderComponent(reviews, { props: { rating: 4.8, max: 5, count: 1204, source: "Trustpilot" } })

    expect(screen.getByText("4.8 out of 5")).toBeVisible()
    expect(screen.getByText("from 1,204 reviews")).toBeVisible()
    expect(screen.getByText("on Trustpilot")).toBeVisible()
  })

  it("groups the digits, because a count is read rather than parsed", () => {
    renderComponent(reviews, { props: { rating: 5, count: 1000000, source: "" } })

    expect(screen.getByText("from 1,000,000 reviews")).toBeVisible()
  })

  it("counts one review in the singular", () => {
    renderComponent(reviews, { props: { rating: 5, count: 1, source: "" } })

    expect(screen.getByText("from 1 review")).toBeVisible()
  })

  it("says nothing about a count of none", () => {
    // "from 0 reviews" is worse than silence on a page trying to sell
    // something.
    renderComponent(reviews, { props: { rating: 5, count: 0, source: "" } })

    expect(screen.queryByText(/review/)).toBeNull()
  })

  it("survives a locale that is not one", () => {
    renderComponent(reviews, { props: { rating: 5, count: 1204, locale: "not-a-locale" } })

    expect(screen.getByText(/1,?204 reviews/)).toBeVisible()
  })

  it("ships no JavaScript", () => {
    expect(reviews.interactive).toBe(false)
  })
})

describe("a testimonial", () => {
  it("is a quotation with its author attached", () => {
    /*
     * A figure around a blockquote and a figcaption is what HTML has for a
     * quotation and the person it came from. Three divs would read as three
     * unrelated paragraphs.
     */
    const { container } = renderComponent(testimonial)

    expect(container.querySelector("figure blockquote")).not.toBeNull()
    expect(container.querySelector("figure figcaption")).not.toBeNull()
  })

  it("shows the words, the name and the role", () => {
    renderComponent(testimonial, {
      props: { quote: "Worth every penny.", name: "Priya", role: "Founder", company: "Acme" },
    })

    expect(screen.getByText("Worth every penny.")).toBeVisible()
    expect(screen.getByText("Priya")).toBeVisible()
    expect(screen.getByText("Founder at Acme")).toBeVisible()
  })

  it.each([
    ["a role and no company", { role: "Founder", company: "" }, "Founder"],
    ["a company and no role", { role: "", company: "Acme" }, "Acme"],
  ])("attributes somebody with %s", (_name, props, expected) => {
    // Nobody is attributed as "Founder at" or " at Acme".
    renderComponent(testimonial, { props: { quote: "x", name: "Priya", ...props } })

    expect(screen.getByText(expected)).toBeVisible()
  })

  it("says nothing where there is no role at all", () => {
    const { container } = renderComponent(testimonial, {
      props: { quote: "x", name: "Priya", role: "", company: "" },
    })

    expect(container.querySelector(".ck-testimonial-role")).toBeNull()
  })

  it("draws no stars when there is no rating", () => {
    // An empty row of five is a bad review, not an absent one.
    const { container } = renderComponent(testimonial, {
      props: { quote: "x", name: "Priya", rating: 0 },
    })

    expect(container.querySelector(".ck-stars")).toBeNull()
  })

  it("says the rating for somebody who cannot see the stars", () => {
    const { container } = renderComponent(testimonial, {
      props: { quote: "x", name: "Priya", rating: 5 },
    })

    expect(within(container).getByText("Rated 5 out of 5")).toBeInTheDocument()
  })

  it("leaves an avatar undescribed when the name is beside it", () => {
    const { container } = renderComponent(testimonial, {
      props: { quote: "x", name: "Priya", avatar: "https://cdn.test/p.png" },
    })

    expect(container.querySelector("img")).toHaveAttribute("alt", "")
  })

  it("ships no JavaScript", () => {
    expect(testimonial.interactive).toBe(false)
  })
})

describe("axe", () => {
  it("reports nothing for a testimonial", async () => {
    const { container } = renderComponent(testimonial, {
      props: { ...testimonial.defaultProps, avatar: "https://cdn.test/p.png", company: "Acme" },
    })

    await expectNoViolations(container)
  })

  it("reports nothing for a summary of reviews", async () => {
    const { container } = renderComponent(reviews)

    await expectNoViolations(container)
  })
})
