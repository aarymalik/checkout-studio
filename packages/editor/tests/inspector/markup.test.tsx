import { defineProperties } from "@checkout-studio/plugin-sdk"
import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import type { ReactElement } from "react"
import { describe, expect, it, vi } from "vitest"

import { Control, PropertyInspector } from "../../src/inspector"

/**
 * The markup control.
 *
 * A code box. What the document holds is the structure the text parses to,
 * and the parser belongs to a plugin — so this edits text, reports text, and
 * stays unable to tell HTML from CSS.
 */

const MARKUP = defineProperties([
  { key: "content", target: "prop", label: "HTML", group: "General", control: "markup" },
])[0] as PropertyDefinition

describe("the control", () => {
  function control(initial: string, onChange = vi.fn()) {
    function Harness(): ReactElement {
      const [value, setValue] = useState(initial)

      return (
        <Control
          definition={MARKUP}
          value={value}
          onChange={(next) => {
            setValue(String(next))
            onChange(next)
          }}
        />
      )
    }

    render(<Harness />)

    return onChange
  }

  it("is a code box, not a line", () => {
    control("<p>Hello</p>")

    const field = screen.getByLabelText("HTML")

    expect(field.tagName).toBe("TEXTAREA")
    expect(field).toHaveValue("<p>Hello</p>")
  })

  it("turns off the three things that treat a tag as a typo", () => {
    control("")

    const field = screen.getByLabelText("HTML")

    expect(field).toHaveAttribute("spellcheck", "false")
    expect(field).toHaveAttribute("autocorrect", "off")
    expect(field).toHaveAttribute("autocapitalize", "off")
  })

  it("reports nothing until the field is left", async () => {
    /*
     * The fault this prevents: what the document holds is the structure the
     * text parses to, and the box shows that structure serialised back. A
     * report on every keystroke means a parse on every keystroke, so typing
     * `<` stores a tree with nothing in it, which serialises to an empty
     * string, which lands back in the box and deletes the character just
     * typed. Nothing could ever be written.
     */
    const onChange = control("")

    await userEvent.type(screen.getByLabelText("HTML"), "<p>Hi</p>")

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByLabelText("HTML")).toHaveValue("<p>Hi</p>")
  })

  it("reports when it is left", async () => {
    const onChange = control("")

    await userEvent.type(screen.getByLabelText("HTML"), "<p>Hi</p>")
    await userEvent.tab()

    expect(onChange).toHaveBeenCalledExactlyOnceWith("<p>Hi</p>")
  })

  it("says Mixed rather than showing one selection's markup", () => {
    render(<Control definition={MARKUP} value="<p>Hi</p>" mixed onChange={vi.fn()} />)

    expect(screen.getByLabelText("HTML")).toHaveValue("")
    expect(screen.getByLabelText("HTML")).toHaveAttribute("placeholder", "Mixed")
  })
})

describe("what the application wants said about a value", () => {
  it("is shown under the control it belongs to", () => {
    /*
     * The markup properties are why this exists. A filter that silently
     * deletes half of what somebody pasted teaches them the feature is
     * broken; one that names `script` teaches them what the rule is. The
     * parser that knows those names belongs to a plugin, so the words arrive
     * from outside this package.
     */
    const { container } = render(
      <PropertyInspector
        definitions={[MARKUP]}
        values={{ content: "<p>Hi</p>" }}
        notes={{ content: ["Removed: script, onclick."] }}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByText("Removed: script, onclick.")).toBeVisible()
    expect(container.querySelector('[data-inspector-notes="content"]')).not.toBeNull()
  })

  it("is announced, because it answers something just typed", () => {
    render(
      <PropertyInspector
        definitions={[MARKUP]}
        values={{ content: "" }}
        notes={{ content: ["Removed: script."] }}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByRole("status")).toHaveTextContent("Removed: script.")
  })

  it("draws nothing when there is nothing to say", () => {
    const { container } = render(
      <PropertyInspector
        definitions={[MARKUP]}
        values={{ content: "" }}
        notes={{ content: [] }}
        onChange={vi.fn()}
      />,
    )

    expect(container.querySelector("[data-inspector-notes]")).toBeNull()
  })
})
