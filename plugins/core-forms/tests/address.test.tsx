import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactElement, ReactNode } from "react"
import { describe, expect, it } from "vitest"

import { address } from "../src/components/address/definition"
import { partsOf } from "../src/components/address/parts"
import { country } from "../src/components/choice/definitions"
import { COUNTRIES, COUNTRY_CODES } from "../src/components/choice/countries"
import { FormProvider } from "../src/form/FormProvider"
import { expectNoViolations } from "./axe"
import { nodeOf } from "./support"

function field(definition: typeof address, props: Record<string, unknown> = {}): ReactElement {
  const Renderer = definition.renderer

  return (
    <FormProvider>
      <Renderer
        node={nodeOf(definition.type, { id: "nod_a" })}
        props={{ ...definition.defaultProps, ...props }}
        className="ck-test"
        mode="published"
      >
        {null as ReactNode}
      </Renderer>
    </FormProvider>
  )
}

describe("Address", () => {
  it("asks for the parts of an address, each labelled", () => {
    render(field(address))

    /*
     * Anchored, because "Address" is also the start of "Address line 2" and a
     * loose pattern matched both. The required ones carry a " *" after the
     * label, which is in the accessible name.
     */
    for (const label of [
      /^Address \*$/,
      /^Address line 2$/,
      /^Town or city \*$/,
      /^Postcode \*$/,
    ]) {
      expect(screen.getByLabelText(label)).toBeInstanceOf(HTMLInputElement)
    }
  })

  it("saves each part under the field's name and its own", () => {
    const specs = partsOf({ name: "delivery" }, "nod_a")

    expect(specs.map((spec) => spec.name)).toEqual([
      "delivery.line1",
      "delivery.line2",
      "delivery.city",
      "delivery.region",
      "delivery.postcode",
    ])
  })

  it("keeps the optional parts optional even when the field is required", () => {
    // "Address line 2 is required" is a sentence no checkout should produce,
    // and a county is not a thing every address has.
    const specs = partsOf({ required: true }, "nod_a")
    const optional = specs.filter((spec) => !spec.required).map((spec) => spec.name)

    expect(optional).toEqual(["nod_a.line2", "nod_a.region"])
  })

  it("does not register a part the merchant switched off", () => {
    /*
     * The part is not in the list, so it is never registered and its value is
     * never in the submission — the same mechanism a condition will use, which
     * is why there is no second one.
     */
    const specs = partsOf({ showline2: false, showregion: false }, "nod_a")

    expect(specs.map((spec) => spec.name)).not.toContain("nod_a.line2")
    expect(specs).toHaveLength(3)
  })

  it("takes a reworded label", () => {
    render(field(address, { labelpostcode: "ZIP code" }))

    expect(screen.getByLabelText(/ZIP code/)).toBeInstanceOf(HTMLInputElement)
  })

  it("tells the browser what each part is, so autofill can do the typing", () => {
    // An address is the most tedious thing on a checkout and the one autofill
    // is best at.
    render(field(address))

    expect(screen.getByLabelText(/^Address \*$/)).toHaveAttribute("autocomplete", "address-line1")
    expect(screen.getByLabelText(/^Address line 2$/)).toHaveAttribute(
      "autocomplete",
      "address-line2",
    )
    expect(screen.getByLabelText(/^Postcode \*$/)).toHaveAttribute("autocomplete", "postal-code")
  })

  it("remembers each part separately", async () => {
    render(field(address))

    await userEvent.type(screen.getByLabelText(/Town or city/), "Bristol")

    expect(screen.getByLabelText(/Town or city/)).toHaveValue("Bristol")
    expect(screen.getByLabelText(/Postcode/)).toHaveValue("")
  })

  it("refuses an address that asks for nothing", () => {
    const off = Object.fromEntries(
      ["line1", "line2", "city", "region", "postcode"].map((part) => [`show${part}`, false]),
    )

    expect(address.validate?.(nodeOf("core.address", { props: off }), {} as never)).toMatch(
      /asks for nothing/,
    )
  })

  it("reports a part that is missing when it is left", async () => {
    render(field(address))

    await userEvent.click(screen.getByLabelText(/Postcode/))
    await userEvent.tab()

    expect(await screen.findByText("Postcode is required.")).toBeVisible()
  })
})

describe("Country Selector", () => {
  it("offers the countries the merchant chose, and no others", () => {
    const chosen = [
      { value: "GB", label: "United Kingdom" },
      { value: "IE", label: "Ireland" },
    ]
    const Renderer = country.renderer

    render(
      <FormProvider>
        <Renderer
          node={nodeOf("core.country", { id: "nod_c" })}
          props={{ ...country.defaultProps, options: chosen }}
          className="ck-test"
          mode="published"
        >
          {null as ReactNode}
        </Renderer>
      </FormProvider>,
    )

    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Choose…",
      "United Kingdom",
      "Ireland",
    ])
  })

  it("refuses a field that offers nowhere to ship to", () => {
    // Defaulting to a guess would be this component deciding where somebody's
    // business ships to, and the merchant is the only one who knows.
    expect(
      country.validate?.(nodeOf("core.country", { props: { options: [] } }), {} as never),
    ).toMatch(/no countries/)
  })

  it("offers codes an address and a payment processor both understand", () => {
    // Two letters, ISO 3166-1 alpha-2 — what Stripe takes and what a shipping
    // label needs.
    for (const entry of COUNTRIES) {
      expect(entry.value).toMatch(/^[A-Z]{2}$/)
      expect(entry.label.trim()).not.toBe("")
    }

    expect(COUNTRY_CODES.size).toBe(COUNTRIES.length)
  })
})

describe("axe", () => {
  it("reports nothing for an address", async () => {
    const { container } = render(field(address))

    await expectNoViolations(container)
  })

  it("reports nothing for an address showing an error", async () => {
    const { container } = render(field(address))

    await userEvent.click(screen.getByLabelText(/Postcode/))
    await userEvent.tab()
    await screen.findByText("Postcode is required.")

    await expectNoViolations(container)
  })
})
