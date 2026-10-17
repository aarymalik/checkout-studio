import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { faq } from "../src/components/faq/definition"
import { readItems } from "../src/components/faq/items"
import { logoWall } from "../src/components/logo-wall/definition"
import { readLogos } from "../src/components/logo-wall/logos"
import { FAQ_STYLES } from "../src/components/faq/styles"
import { expectNoViolations } from "./axe"
import { renderComponent } from "./support"

describe("reading questions", () => {
  it("keeps the pairs", () => {
    expect(readItems([{ question: "When?", answer: "Soon." }])).toEqual([
      { question: "When?", answer: "Soon." },
    ])
  })

  it.each([
    ["a question with no answer", { question: "When?" }],
    ["an answer with no question", { answer: "Soon." }],
    ["both blank", { question: "  ", answer: "  " }],
  ])("drops %s", (_name, entry) => {
    // A question with no answer is a disclosure that opens onto nothing.
    expect(readItems([entry])).toEqual([])
  })

  it.each([
    ["nothing", undefined],
    ["a string", "when?"],
    ["nonsense inside", [1, null, "x"]],
  ])("survives %s", (_name, value) => {
    expect(() => readItems(value)).not.toThrow()
    expect(readItems(value)).toEqual([])
  })
})

describe("a list of questions", () => {
  it("is disclosures the browser already knows how to open", () => {
    /*
     * The opening, the keyboard, the expanded announcement and find-in-page
     * are all the element's. A pair of divs with a click handler would need
     * aria-expanded, aria-controls, a key handler, a focus ring and a tab
     * stop — and would ship JavaScript to do it.
     */
    const { container } = renderComponent(faq)

    expect(container.querySelectorAll("details")).toHaveLength(2)
    expect(container.querySelectorAll("summary")).toHaveLength(2)
  })

  it("starts closed, and opens when asked", async () => {
    renderComponent(faq)

    const first = screen.getAllByRole("group")[0] as HTMLDetailsElement

    expect(first.open).toBe(false)

    await userEvent.click(screen.getByText("When will it arrive?"))

    expect(first.open).toBe(true)
  })

  it("shows the merchant's own questions, and keeps the answers shut", async () => {
    /*
     * The answer is in the document and not visible, which is the disclosure
     * doing its job — and the browser can still find it with find-in-page and
     * open the right one. The first version of this asserted the answer was
     * visible straight away, which would only be true if the element were not
     * working.
     */
    renderComponent(faq, {
      props: { items: [{ question: "Is it vegan?", answer: "Entirely." }] },
    })

    expect(screen.getByText("Is it vegan?")).toBeVisible()
    expect(screen.getByText("Entirely.")).not.toBeVisible()

    await userEvent.click(screen.getByText("Is it vegan?"))

    expect(screen.getByText("Entirely.")).toBeVisible()
  })

  it("draws nothing when there is nothing to ask", () => {
    const { container } = renderComponent(faq, { props: { items: [] } })

    expect(container.querySelector("details")).toBeNull()
  })

  it("turns its chevron through a selector the renderer will emit", () => {
    /*
     * The universal spelling is `details[open]`, and attribute selectors are
     * dropped by the renderer's grammar — a rule written that way would style
     * nothing, silently. This is the pseudo-class, which survives.
     */
    expect(Object.keys(FAQ_STYLES)).toContain("details:open svg")
    expect(Object.keys(FAQ_STYLES).join(" ")).not.toContain("[open]")
  })

  it("hides its chevron from a screen reader", () => {
    const { container } = renderComponent(faq)

    for (const svg of container.querySelectorAll("svg")) {
      expect(svg).toHaveAttribute("aria-hidden")
    }
  })

  it("ships no JavaScript", () => {
    expect(faq.interactive).toBe(false)
  })
})

describe("reading logos", () => {
  it("keeps the ones with a name", () => {
    expect(readLogos([{ src: "https://cdn.test/a.svg", label: "Acme" }])).toEqual([
      { src: "https://cdn.test/a.svg", label: "Acme" },
    ])
  })

  it("drops one nobody labelled", () => {
    /*
     * "As seen in" is a claim, and a claim a screen reader cannot read is a
     * claim that is not being made to everybody. There is no honest alt text
     * for a picture nobody named.
     */
    expect(readLogos([{ src: "https://cdn.test/a.svg" }])).toEqual([])
  })

  it("drops one with a name and no picture", () => {
    expect(readLogos([{ label: "Acme" }])).toEqual([])
  })

  it.each([
    ["nothing", undefined],
    ["a string", "acme"],
    ["nonsense inside", [1, null, "x"]],
  ])("survives %s", (_name, value) => {
    expect(() => readLogos(value)).not.toThrow()
    expect(readLogos(value)).toEqual([])
  })
})

describe("a wall of logos", () => {
  const LOGOS = [
    { src: "https://cdn.test/a.svg", label: "Acme" },
    { src: "https://cdn.test/b.svg", label: "Globex" },
  ]

  it("is a list, so it is counted before it is read", () => {
    renderComponent(logoWall, { props: { logos: LOGOS } })

    expect(screen.getByRole("list")).toBeVisible()
    expect(screen.getAllByRole("listitem")).toHaveLength(2)
  })

  it("names every picture", () => {
    renderComponent(logoWall, { props: { logos: LOGOS } })

    expect(screen.getByAltText("Acme")).toBeVisible()
    expect(screen.getByAltText("Globex")).toBeVisible()
  })

  it("defers loading, because none of them is why anybody came", () => {
    renderComponent(logoWall, { props: { logos: LOGOS } })

    expect(screen.getByAltText("Acme")).toHaveAttribute("loading", "lazy")
  })

  it("invents no logos of its own", () => {
    // A wall of made-up brands is a claim the merchant has not made, and one
    // that would be easy to publish by accident.
    expect(logoWall.defaultProps["logos"]).toBeUndefined()

    const { container } = renderComponent(logoWall)

    expect(container.querySelectorAll("img")).toHaveLength(0)
  })

  it("ships no JavaScript", () => {
    expect(logoWall.interactive).toBe(false)
  })
})

describe("axe", () => {
  it("reports nothing for a list of questions", async () => {
    const { container } = renderComponent(faq)

    await expectNoViolations(container)
  })

  it("reports nothing for a wall of logos", async () => {
    const { container } = renderComponent(logoWall, {
      props: { logos: [{ src: "https://cdn.test/a.svg", label: "Acme" }] },
    })

    await expectNoViolations(container)
  })
})
