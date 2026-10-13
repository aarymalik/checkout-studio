import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"
import type { ReactElement, ReactNode } from "react"
import { describe, expect, it } from "vitest"

import { checkbox, radioGroup, select } from "../src/components/choice/definitions"
import { textarea } from "../src/components/input/definition"
import { FormProvider } from "../src/form/FormProvider"
import { expectNoViolations } from "./axe"
import { nodeOf } from "./support"

const DELIVERY = [
  { value: "standard", label: "Standard" },
  { value: "express", label: "Express" },
]

/** A field, inside the form its page would give it. */
function field(definition: ComponentDefinition, props: Record<string, unknown> = {}): ReactElement {
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

describe("Textarea", () => {
  it("is a multi-line control with the rows it was given", () => {
    render(field(textarea, { label: "Notes", rows: 6 }))

    const control = screen.getByLabelText("Notes")

    expect(control.tagName).toBe("TEXTAREA")
    expect(control).toHaveAttribute("rows", "6")
  })

  it("remembers what was typed", async () => {
    render(field(textarea, { label: "Notes" }))

    await userEvent.type(screen.getByLabelText("Notes"), "Leave it with a neighbour")

    expect(screen.getByLabelText("Notes")).toHaveValue("Leave it with a neighbour")
  })
})

describe("Select", () => {
  it("offers what it was given, under its label", () => {
    render(field(select, { label: "Delivery", options: DELIVERY }))

    expect(
      within(screen.getByLabelText("Delivery"))
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Choose…", "Standard", "Express"])
  })

  it("holds the value, not the label — so a rewording does not change answers", async () => {
    render(field(select, { label: "Delivery", options: DELIVERY }))

    await userEvent.selectOptions(screen.getByLabelText("Delivery"), "express")

    expect(screen.getByLabelText("Delivery")).toHaveValue("express")
  })

  it("will not let a required field be put back to nothing", () => {
    render(field(select, { label: "Delivery", options: DELIVERY, required: true }))

    expect(
      within(screen.getByLabelText(/Delivery/)).getByRole("option", { name: "Choose…" }),
    ).toBeDisabled()
  })

  it("says what is wrong when nothing was chosen", async () => {
    render(field(select, { label: "Delivery", options: DELIVERY, required: true }))

    await userEvent.click(screen.getByLabelText(/Delivery/))
    await userEvent.tab()

    expect(await screen.findByText("Delivery is required.")).toBeVisible()
  })

  it("refuses a group with nothing to choose from", () => {
    expect(
      select.validate?.(nodeOf("core.select", { props: { options: [] } }), {} as never),
    ).toMatch(/nothing to choose/)
  })
})

describe("Checkbox", () => {
  it("is labelled by the words beside it, and the words are clickable", async () => {
    render(field(checkbox, { label: "Email me about my order" }))

    await userEvent.click(screen.getByText("Email me about my order"))

    expect(screen.getByLabelText(/Email me about my order/)).toBeChecked()
  })

  it("is in the form, which is what puts a ticked box in the payload", async () => {
    /*
     * The checkbox lays its label out differently from every other field and,
     * in the first version, did its own everything — including not
     * registering. A field that does not register looks right, holds what
     * somebody ticked, and submits nothing.
     */
    render(field(checkbox, { label: "Terms", required: true }))

    await userEvent.click(screen.getByLabelText(/Terms/))
    await userEvent.tab()

    expect(screen.queryByText(/has to be ticked/)).toBeNull()
  })

  it("asks to be ticked rather than claiming to be missing", async () => {
    // "Terms is required" reads as an unanswered question. What the person
    // has to do is tick the box.
    render(field(checkbox, { label: "Terms", required: true }))

    await userEvent.click(screen.getByLabelText(/Terms/))
    await userEvent.click(screen.getByLabelText(/Terms/))
    await userEvent.tab()

    expect(await screen.findByText("Terms has to be ticked.")).toBeVisible()
  })
})

describe("Radio Group", () => {
  it("is a group whose name is the question", () => {
    render(field(radioGroup, { label: "Delivery", options: DELIVERY }))

    expect(screen.getByRole("group", { name: /Delivery/ })).toBeInstanceOf(HTMLFieldSetElement)
  })

  it("gives every option the same name, so they are one answer", () => {
    render(field(radioGroup, { label: "Delivery", options: DELIVERY, name: "delivery" }))

    for (const option of screen.getAllByRole("radio")) {
      expect(option).toHaveAttribute("name", "delivery")
    }
  })

  it("moves between options with the arrow keys, as radios do", async () => {
    render(field(radioGroup, { label: "Delivery", options: DELIVERY }))

    await userEvent.click(screen.getByRole("radio", { name: "Standard" }))
    await userEvent.keyboard("{ArrowDown}")

    expect(screen.getByRole("radio", { name: "Express" })).toBeChecked()
  })

  it("refuses a group with nothing to choose from", () => {
    expect(
      radioGroup.validate?.(nodeOf("core.radio-group", { props: { options: [] } }), {} as never),
    ).toMatch(/nothing to choose/)
  })
})

describe("axe", () => {
  it.each([
    ["a textarea", textarea, { label: "Notes" }],
    ["a select", select, { label: "Delivery", options: DELIVERY, required: true }],
    ["a checkbox", checkbox, { label: "Email me", help: "About this order only." }],
    ["a radio group", radioGroup, { label: "Delivery", options: DELIVERY, required: true }],
  ])("reports nothing for %s", async (_name, definition, props) => {
    const { container } = render(field(definition, props))

    await expectNoViolations(container)
  })
})
