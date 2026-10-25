import { defineProperties } from "@checkout-studio/plugin-sdk"
import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { PropertyInspector, sectionsFor, isShown, valuesFor } from "../../src/inspector"

const PROPERTIES = defineProperties([
  { key: "title", target: "prop", label: "Title", group: "General", control: "text" },
  {
    key: "level",
    target: "prop",
    label: "Level",
    group: "Typography",
    control: "number",
    min: 1,
    max: 6,
  },
  { key: "hidden", target: "prop", label: "Hidden", group: "General", control: "toggle" },
  { key: "shade", target: "style", label: "Shadow", group: "Effects", control: "shadow" },
  // Still unbuilt, and the fixture for the fallback below. The shadow served
  // this purpose until the shadow control was built, and the gradient until
  // the gradient control was. An asset is the last one left: Phase 14 builds
  // the storage it would pick from, and depends on this phase for the picker.
  { key: "picture", target: "prop", label: "Picture", group: "Background", control: "asset" },
])

function panel(
  definitions: readonly PropertyDefinition[] = PROPERTIES,
  values: Record<string, unknown> = {},
  onChange = vi.fn(),
) {
  return render(<PropertyInspector definitions={definitions} values={values} onChange={onChange} />)
}

describe("what the panel is built from", () => {
  it("has no idea what component it is showing", () => {
    /*
     * The exit criterion for this phase, stated as a test. There is no branch
     * on a type id anywhere in the panel, so a component registered by a
     * plugin nobody has written yet gets an inspector for free.
     */
    panel()

    expect(screen.getByText("General")).toBeVisible()
    expect(screen.getByText("Typography")).toBeVisible()
    expect(screen.getByText("Effects")).toBeVisible()
  })

  it("puts the sections in the order the SDK lists them, whatever order they arrive in", () => {
    const shuffled = defineProperties([
      { key: "a", target: "prop", label: "A", group: "Advanced", control: "text" },
      { key: "b", target: "prop", label: "B", group: "General", control: "text" },
      { key: "c", target: "style", label: "C", group: "Layout", control: "dimension" },
    ])

    expect(sectionsFor(shuffled, {}).map((section) => section.group)).toEqual([
      "General",
      "Layout",
      "Advanced",
    ])
  })

  it("draws no section for a group nothing belongs to", () => {
    // Eleven headings with two of them holding anything is a panel somebody
    // has to search rather than read.
    panel()

    expect(screen.queryByText("Border")).toBeNull()
    expect(screen.queryByText("Animation")).toBeNull()
  })

  it("folds an advanced property out of its own group", () => {
    const definitions = defineProperties([
      {
        key: "flow",
        target: "style",
        label: "Flow",
        group: "Layout",
        control: "text",
        advanced: true,
      },
    ])

    expect(sectionsFor(definitions, {}).map((section) => section.group)).toEqual(["Advanced"])
  })

  it("says so when the component has nothing to configure", () => {
    // True of a Spacer, and not a fault.
    const { container } = panel([])

    expect(container.querySelector('[data-inspector-state="no-properties"]')).not.toBeNull()
  })

  it("says something different when nothing is selected at all", () => {
    const { container } = render(
      <PropertyInspector definitions={PROPERTIES} values={{}} onChange={vi.fn()} empty />,
    )

    expect(container.querySelector('[data-inspector-state="no-selection"]')).not.toBeNull()
  })
})

describe("a property that waits for another", () => {
  const definitions = defineProperties([
    {
      key: "kind",
      target: "prop",
      label: "Kind",
      group: "General",
      control: "select",
      options: [
        { value: "link", label: "Link" },
        { value: "button", label: "Button" },
      ],
    },
    {
      key: "href",
      target: "prop",
      label: "Address",
      group: "General",
      control: "text",
      showWhen: { key: "kind", equals: "link" },
    },
  ])

  it("is hidden until the condition is met", () => {
    expect(isShown(definitions[1] as PropertyDefinition, { kind: "button" })).toBe(false)
    expect(isShown(definitions[1] as PropertyDefinition, { kind: "link" })).toBe(true)
  })

  it("is hidden when the key it watches holds nothing", () => {
    /*
     * A control that appeared because a prop was absent would appear on every
     * freshly inserted component, which is the opposite of what a condition is
     * for.
     */
    expect(isShown(definitions[1] as PropertyDefinition, {})).toBe(false)
  })

  it("understands the other kind of condition", () => {
    const unless = defineProperties([
      {
        key: "alt",
        target: "prop",
        label: "Alt",
        group: "Accessibility",
        control: "text",
        showWhen: { key: "decorative", not: true },
      },
    ])

    expect(isShown(unless[0] as PropertyDefinition, { decorative: true })).toBe(false)
    expect(isShown(unless[0] as PropertyDefinition, { decorative: false })).toBe(true)
  })
})

describe("what a node currently holds", () => {
  it("reads props and styles into one map, because the panel shows them as one list", () => {
    const node = {
      id: "n",
      type: "core.heading",
      parentId: null,
      children: [],
      props: { title: "Hello" },
      styles: { desktop: { base: { shade: "0 1px 2px #0001" } } },
      visibility: { hidden: false },
      animations: [],
      metadata: {},
    }

    expect(valuesFor(node as never, PROPERTIES)).toEqual({
      title: "Hello",
      level: undefined,
      hidden: undefined,
      shade: "0 1px 2px #0001",
      picture: undefined,
    })
  })
})

describe("a control nobody has built yet", () => {
  it("says so rather than drawing the wrong one", async () => {
    /*
     * A text box over a shadow writes the wrong shape into the document, and a
     * disabled slider teaches somebody the product is broken. Saying it plainly
     * does neither.
     *
     * Opened first, because a closed accordion section is not in the document
     * at all — which is the panel keeping its own promise about one section at
     * a time rather than something to work around.
     */
    const { container } = panel()

    await userEvent.click(screen.getByText("Background"))

    expect(container.querySelector('[data-inspector-unbuilt="asset"]')).not.toBeNull()
    expect(screen.getByText("No asset control yet.")).toBeVisible()
  })

  it("does not stop the controls around it rendering", () => {
    panel()

    expect(screen.getByLabelText("Title")).toBeInstanceOf(HTMLInputElement)
  })
})

describe("changing a value", () => {
  it("reports the definition that changed, not just a key", () => {
    /*
     * The caller has to know whether to write to props or to styles, and the
     * definition is the only thing that knows. Handing back a bare key would
     * make every caller look it up again.
     */
    const onChange = vi.fn()

    panel(PROPERTIES, { hidden: false }, onChange)

    return userEvent.click(screen.getByLabelText("Hidden")).then(() => {
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange.mock.calls[0]?.[0]).toMatchObject({ key: "hidden", target: "prop" })
      expect(onChange.mock.calls[0]?.[1]).toBe(true)
    })
  })

  it("sends what was typed", async () => {
    const onChange = vi.fn()

    panel(PROPERTIES, { title: "" }, onChange)

    await userEvent.type(screen.getByLabelText("Title"), "H")

    // A third argument names the key to write, and only a side control sends
    // one — so this asserts the parts rather than the whole call.
    const [definition, value, key] = onChange.mock.calls.at(-1) as [
      { key: string },
      string,
      string | undefined,
    ]

    expect(definition.key).toBe("title")
    expect(value).toBe("H")
    expect(key).toBeUndefined()
  })
})
