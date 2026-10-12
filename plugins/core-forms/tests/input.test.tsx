import { PluginHost } from "@checkout-studio/plugin-sdk"
import { CURRENT_VERSION } from "@checkout-studio/schema"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactElement, ReactNode } from "react"
import { describe, expect, it } from "vitest"

import { input } from "../src/components/input/definition"
import { FormProvider } from "../src/form/FormProvider"
import { coreForms } from "../src/renderer"
import { expectNoViolations } from "./axe"
import { nodeOf } from "./support"

/** A field, inside the form its page would give it. */
function field(props: Record<string, unknown>, nodeId = "nod_a"): ReactElement {
  const Renderer = input.renderer

  return (
    <FormProvider>
      <Renderer
        node={nodeOf("core.input", { id: nodeId })}
        props={{ ...input.defaultProps, ...props }}
        className="ck-test"
        mode="published"
      >
        {null as ReactNode}
      </Renderer>
    </FormProvider>
  )
}

describe("the field a customer sees", () => {
  it("has a label that stays visible, and is what the field is announced by", () => {
    render(field({ label: "Email address" }))

    expect(screen.getByLabelText(/Email address/)).toBeInstanceOf(HTMLInputElement)
  })

  it("keeps the placeholder separate from the label", () => {
    // A placeholder disappears the moment somebody types, so a form built from
    // them is one nobody can check before submitting.
    render(field({ label: "Email address", placeholder: "name@example.com" }))

    expect(screen.getByLabelText(/Email address/)).toHaveAttribute(
      "placeholder",
      "name@example.com",
    )
  })

  it("says it is required in a way a screen reader hears", () => {
    render(field({ label: "Email", required: true }))

    expect(screen.getByLabelText(/Email/)).toHaveAttribute("aria-required", "true")
  })

  it("hides the required mark from the screen reader that already heard it", () => {
    render(field({ label: "Email", required: true }))

    expect(screen.getByText("*")).toHaveAttribute("aria-hidden", "true")
  })

  it("is the input type its kind asks for", () => {
    render(field({ label: "Email", kind: "email" }))

    expect(screen.getByLabelText(/Email/)).toHaveAttribute("type", "email")
  })

  it("reads its help text out with the field", () => {
    render(field({ label: "Phone", help: "Only if something goes wrong." }))

    expect(screen.getByLabelText(/Phone/)).toHaveAccessibleDescription(
      "Only if something goes wrong.",
    )
  })
})

describe("typing", () => {
  it("remembers what was typed", async () => {
    render(field({ label: "Name" }))

    await userEvent.type(screen.getByLabelText(/Name/), "Ada")

    expect(screen.getByLabelText(/Name/)).toHaveValue("Ada")
  })

  it("does not complain while somebody is still typing", async () => {
    /*
     * Validating every keystroke tells somebody their email is wrong when they
     * are three characters into typing it, which is the most common way a form
     * comes to feel hostile.
     */
    render(field({ label: "Email", kind: "email", required: true }))

    await userEvent.type(screen.getByLabelText(/Email/), "some")

    expect(screen.queryByTestId("error")).toBeNull()
    expect(screen.getByLabelText(/Email/)).not.toHaveAttribute("aria-invalid")
  })

  it("checks the field when it is left", async () => {
    render(field({ label: "Email", kind: "email", required: true }))

    await userEvent.type(screen.getByLabelText(/Email/), "someone@")
    await userEvent.tab()

    expect(await screen.findByText(/needs an email address/)).toBeVisible()
  })

  it("announces the error through the field itself", async () => {
    render(field({ label: "Email", kind: "email", required: true }))

    await userEvent.click(screen.getByLabelText(/Email/))
    await userEvent.tab()

    const control = screen.getByLabelText(/Email/)

    expect(control).toHaveAttribute("aria-invalid", "true")
    expect(control).toHaveAccessibleDescription("Email is required.")
  })

  it("clears the error as soon as somebody starts fixing it", async () => {
    render(field({ label: "Email", kind: "email", required: true }))

    await userEvent.click(screen.getByLabelText(/Email/))
    await userEvent.tab()
    await userEvent.type(screen.getByLabelText(/Email/), "a")

    expect(screen.queryByText("Email is required.")).toBeNull()
  })
})

describe("in the editor", () => {
  it("is read-only rather than disabled", () => {
    /*
     * A disabled field is skipped by the keyboard and dimmed, so the canvas
     * would be showing the component in a state no published page puts it in.
     */
    const Renderer = input.renderer
    render(
      <Renderer
        node={nodeOf("core.input")}
        props={{ ...input.defaultProps, label: "Name" }}
        className="ck-test"
        mode="editor-preview"
      >
        {null as ReactNode}
      </Renderer>,
    )

    const control = screen.getByLabelText(/Name/)

    expect(control).toHaveAttribute("readonly")
    expect(control).not.toBeDisabled()
  })

  it("renders outside a form rather than throwing", () => {
    // A field dropped onto a canvas has no form around it yet, and a component
    // that threw would take the canvas down for a page that is half-built.
    const Renderer = input.renderer

    expect(() =>
      render(
        <Renderer
          node={nodeOf("core.input")}
          props={input.defaultProps}
          className="ck-test"
          mode="editor-preview"
        >
          {null as ReactNode}
        </Renderer>,
      ),
    ).not.toThrow()
  })
})

describe("validation of the node itself", () => {
  it("reports a field the merchant has not named", () => {
    /*
     * It still renders, labelled by its kind — a field with no accessible
     * name is unusable, so there is no state in which that happens. What is
     * reported is that nobody chose the name, which is a question about the
     * prop rather than about what the component fell back to.
     */
    expect(input.validate?.(nodeOf("core.input", { props: { label: "  " } }), {} as never)).toMatch(
      /no label/,
    )
  })

  it("still gives that field a label a screen reader can announce", () => {
    render(field({ label: "  " }, "nod_unnamed"))

    expect(screen.getByLabelText("Text")).toBeInstanceOf(HTMLInputElement)
  })

  it("accepts one with a label", () => {
    expect(
      input.validate?.(nodeOf("core.input", { props: { label: "Email" } }), {} as never),
    ).toBeNull()
  })
})

describe("the plugin", () => {
  it("registers the form provider under the id the checkout plugin will depend on", () => {
    const registry = new PluginHost({ versions: { engine: "0.1.0", schema: CURRENT_VERSION } })
      .register(coreForms)
      .startSync()

    expect(registry.providers().map((provider) => provider.id)).toEqual(["forms"])
  })
})

describe("axe", () => {
  it.each([
    ["a plain field", { label: "Name" }],
    ["a required field", { label: "Email", kind: "email", required: true }],
    [
      "a field with help text",
      { label: "Phone", kind: "tel", help: "Only if something goes wrong." },
    ],
  ])("reports nothing for %s", async (_name, props) => {
    const { container } = render(field(props))

    await expectNoViolations(container)
  })

  it("reports nothing for a field showing an error", async () => {
    const { container } = render(field({ label: "Email", kind: "email", required: true }))

    await userEvent.click(screen.getByLabelText(/Email/))
    await userEvent.tab()
    await screen.findByText("Email is required.")

    await expectNoViolations(container)
  })
})
