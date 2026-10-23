import { defineProperties } from "@checkout-studio/plugin-sdk"
import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { PropertyInspector, searchProperties, sectionsFor } from "../../src/inspector"

/**
 * Finding a property in a panel of eleven sections.
 *
 * ## Why it is not the accordion
 *
 * One section open at a time is right for browsing and wrong for reading an
 * answer. A search that put its own matches behind closed headers would be
 * asking the question twice, so results are a flat list — with the group
 * labelling each run, because "Colour" means something different under
 * Typography than under Background.
 */

const DEFINITIONS = defineProperties([
  { key: "text", target: "prop", label: "Text", group: "General", control: "text" },
  {
    key: "backgroundColor",
    target: "style",
    label: "Background colour",
    group: "Background",
    control: "color",
  },
  { key: "color", target: "style", label: "Colour", group: "Typography", control: "color" },
  {
    key: "fontSize",
    target: "style",
    label: "Size",
    group: "Typography",
    control: "dimension",
    units: ["px"],
  },
]) as readonly PropertyDefinition[]

const SECTIONS = sectionsFor(DEFINITIONS, {})

describe("filtering the properties", () => {
  it("keeps everything when nothing is typed", () => {
    const { sections, matches } = searchProperties(SECTIONS, "   ")

    expect(sections).toBe(SECTIONS)
    expect(matches).toBe(DEFINITIONS.length)
  })

  it("matches a label loosely, the way the palette does", () => {
    // The same matcher the command palette and the layers panel use, so "bgc"
    // works here exactly as "ordsum" works there.
    const { sections, matches } = searchProperties(SECTIONS, "bgc")

    expect(matches).toBe(1)
    expect(sections[0]?.properties[0]?.key).toBe("backgroundColor")
  })

  it("keeps a whole section when the section is what was asked for", () => {
    /*
     * "typo" means Typography, and no label in it contains those letters. A
     * search that matched labels alone would answer a question about a section
     * with nothing at all.
     */
    const { sections, matches } = searchProperties(SECTIONS, "typo")

    expect(sections).toHaveLength(1)
    expect(sections[0]?.group).toBe("Typography")
    expect(matches).toBe(2)
  })

  it("drops a section with nothing left in it", () => {
    const { sections } = searchProperties(SECTIONS, "colour")

    expect(sections.map((section) => section.group)).not.toContain("General")
  })

  it("finds nothing when nothing matches, which is not the same as no query", () => {
    const { sections, matches } = searchProperties(SECTIONS, "zzzz")

    expect(sections).toEqual([])
    expect(matches).toBe(0)
  })

  it("leaves the order alone", () => {
    /*
     * The palette sorts by score; this does not. The sections are in the order
     * docs/ui-guidelines.md fixes, and a panel that rearranged itself while
     * somebody typed would make them hunt for a control they had found.
     */
    const { sections } = searchProperties(SECTIONS, "o")
    const order = sections.map((section) => section.group)

    expect(order).toEqual(
      SECTIONS.filter((section) => order.includes(section.group)).map((one) => one.group),
    )
  })
})

describe("the panel while searching", () => {
  function panel() {
    render(
      <PropertyInspector
        definitions={DEFINITIONS}
        values={{ text: "Hi", color: "#000000", backgroundColor: "#ffffff", fontSize: "16px" }}
        onChange={vi.fn()}
      />,
    )

    return screen.getByRole("searchbox", { name: "Search properties" })
  }

  it("shows the matches without asking anybody to open a section", async () => {
    /*
     * The accordion opens one section at a time, so Typography's Colour is
     * behind a closed header until somebody clicks it. A result that arrived
     * closed would be a search that had not answered.
     */
    const search = panel()

    await userEvent.type(search, "colour")

    expect(screen.getByLabelText("Colour")).toBeVisible()
    expect(screen.getByLabelText("Background colour")).toBeVisible()
  })

  it("labels each run with its group, since two of these are called Colour", async () => {
    const search = panel()

    await userEvent.type(search, "colour")

    // Both groups are named, and neither is an accordion header any more —
    // those are buttons, and these are labels over a run of results.
    expect(screen.getByText("Typography")).toBeVisible()
    expect(screen.getByText("Background")).toBeVisible()
    expect(screen.queryByRole("button", { name: "Typography" })).toBeNull()
  })

  it("says so when nothing matches, in the words that were typed", async () => {
    const search = panel()

    await userEvent.type(search, "zzzz")

    expect(screen.getByText('Nothing here is called "zzzz".')).toBeVisible()
  })

  it("puts the accordion back when the field is emptied", async () => {
    const search = panel()

    await userEvent.type(search, "colour")
    await userEvent.clear(search)

    expect(screen.getByRole("button", { name: "General" })).toBeVisible()
  })

  it("empties the field on Escape", async () => {
    // Rather than leaving a filter nobody is looking at applied to the panel.
    const search = panel()

    await userEvent.type(search, "colour")
    await userEvent.keyboard("{Escape}")

    expect(search).toHaveValue("")
  })

  it("takes ⌘F for itself, which the browser would otherwise take", async () => {
    /*
     * reserved.ts already carves this panel out of the browser's find: "both
     * are long lists, both have a search field, and in both a person pressing
     * ⌘F means find in this list rather than find on this page".
     */
    const search = panel()

    screen.getByLabelText("Text").focus()

    await userEvent.keyboard("{Meta>}f{/Meta}")

    expect(search).toHaveFocus()
  })

  it("selects what is there, so a second search replaces the first", async () => {
    const search = panel()

    await userEvent.type(search, "colour")
    await userEvent.keyboard("{Meta>}f{/Meta}")
    await userEvent.keyboard("size")

    expect(search).toHaveValue("size")
  })
})
