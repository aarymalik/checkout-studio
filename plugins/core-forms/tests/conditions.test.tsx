import { createDocument } from "@checkout-studio/schema"
import type { CheckoutSchema, Node, PropValue } from "@checkout-studio/schema"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactElement, ReactNode } from "react"
import { describe, expect, it } from "vitest"

import { input } from "../src/components/input/definition"
import { select } from "../src/components/choice/definitions"
import { FormProvider } from "../src/form/FormProvider"
import { conditionCycles } from "../src/validators"
import { nodeOf } from "./support"

const DELIVERY = [
  { value: "collect", label: "Collect in store" },
  { value: "ship", label: "Ship it to me" },
]

/** One form holding several fields, as a page would. */
function form(
  fields: readonly { definition: typeof input; id: string; props: Record<string, unknown> }[],
): ReactElement {
  return (
    <FormProvider>
      {fields.map(({ definition, id, props }) => {
        const Renderer = definition.renderer

        return (
          <Renderer
            key={id}
            node={nodeOf(definition.type, { id })}
            props={{ ...definition.defaultProps, ...props }}
            className="ck-test"
            mode="published"
          >
            {null as ReactNode}
          </Renderer>
        )
      })}
    </FormProvider>
  )
}

/** A delivery choice, and an address that depends on it. */
function deliveryForm(condition: Record<string, unknown>): ReactElement {
  return form([
    {
      definition: select,
      id: "how",
      props: { label: "Delivery", name: "delivery", options: DELIVERY, required: true },
    },
    {
      definition: input,
      id: "where",
      props: { label: "Address", name: "address", showWhen: condition },
    },
  ])
}

describe("a field that waits for an answer", () => {
  it("is not on the page before the answer is given", () => {
    render(deliveryForm({ field: "delivery", operator: "equals", value: "ship" }))

    expect(screen.queryByLabelText("Address")).toBeNull()
  })

  it("appears when the answer is the one it waits for", async () => {
    render(deliveryForm({ field: "delivery", operator: "equals", value: "ship" }))

    await userEvent.selectOptions(screen.getByLabelText(/Delivery/), "ship")

    expect(screen.getByLabelText("Address")).toBeInstanceOf(HTMLInputElement)
  })

  it("goes again when the answer changes", async () => {
    render(deliveryForm({ field: "delivery", operator: "equals", value: "ship" }))

    await userEvent.selectOptions(screen.getByLabelText(/Delivery/), "ship")
    await userEvent.selectOptions(screen.getByLabelText(/Delivery/), "collect")

    expect(screen.queryByLabelText("Address")).toBeNull()
  })

  it("takes its answer with it", async () => {
    /*
     * The requirement in phases.md: a hidden field's value is excluded from
     * the submission. It falls out of unmounting — `useField`'s cleanup drops
     * the value — rather than being a second thing that has to remember.
     */
    render(deliveryForm({ field: "delivery", operator: "equals", value: "ship" }))

    await userEvent.selectOptions(screen.getByLabelText(/Delivery/), "ship")
    await userEvent.type(screen.getByLabelText("Address"), "12 High Street")
    await userEvent.selectOptions(screen.getByLabelText(/Delivery/), "collect")
    await userEvent.selectOptions(screen.getByLabelText(/Delivery/), "ship")

    expect(screen.getByLabelText("Address")).toHaveValue("")
  })

  it.each([
    ["exists", { field: "delivery", operator: "exists" }, "ship", true],
    ["exists, unanswered", { field: "delivery", operator: "exists" }, "", false],
    ["empty", { field: "delivery", operator: "empty" }, "", true],
    ["not-equals", { field: "delivery", operator: "not-equals", value: "collect" }, "ship", true],
  ])("understands %s", async (_name, condition, answer, shown) => {
    render(deliveryForm(condition))

    if (answer !== "") await userEvent.selectOptions(screen.getByLabelText(/Delivery/), answer)

    expect(screen.queryByLabelText("Address") !== null).toBe(shown)
  })

  it("is not shown when the field it watches is not on the page", () => {
    /*
     * The safer of the two readings: the field it depends on may itself be
     * hidden, and a question whose premise is missing is one somebody answers
     * without knowing what it is about.
     */
    render(
      form([
        {
          definition: input,
          id: "where",
          props: { label: "Address", showWhen: { field: "nobody", operator: "exists" } },
        },
      ]),
    )

    expect(screen.queryByLabelText("Address")).toBeNull()
  })
})

describe("a chain of conditions", () => {
  it("falls when the first one does", async () => {
    render(
      form([
        {
          definition: select,
          id: "how",
          props: { label: "Delivery", name: "delivery", options: DELIVERY, required: true },
        },
        {
          definition: input,
          id: "where",
          props: {
            label: "Address",
            name: "address",
            showWhen: { field: "delivery", operator: "equals", value: "ship" },
          },
        },
        {
          definition: input,
          id: "note",
          props: {
            label: "Delivery note",
            name: "note",
            showWhen: { field: "address", operator: "exists" },
          },
        },
      ]),
    )

    /*
     * Anchored, because "Delivery" is also the start of "Delivery note" and
     * the loose pattern found both. The select is required, so its accessible
     * name carries the asterisk.
     */
    await userEvent.selectOptions(screen.getByLabelText(/^Delivery \*$/), "ship")
    await userEvent.type(screen.getByLabelText("Address"), "12 High Street")

    expect(screen.getByLabelText("Delivery note")).toBeInstanceOf(HTMLInputElement)

    // The first goes, so the second goes, so the third goes — each deciding
    // from the values rather than from the one before it.
    await userEvent.selectOptions(screen.getByLabelText(/^Delivery \*$/), "collect")

    expect(screen.queryByLabelText("Address")).toBeNull()
    expect(screen.queryByLabelText("Delivery note")).toBeNull()
  })
})

describe("conditions that wait for each other", () => {
  function documentOf(
    specs: readonly { id: string; props: Record<string, PropValue> }[],
  ): CheckoutSchema {
    const base = createDocument({
      projectId: "prj_t",
      pageId: "pag_t",
      themeId: "theme_default",
      random: () => 0.5,
    })
    const root = base.nodes[base.root] as Node
    const nodes: Record<string, Node> = { ...base.nodes }

    for (const spec of specs) {
      nodes[spec.id] = {
        ...nodeOf("core.input", { id: spec.id, props: spec.props }),
        parentId: base.root,
      }
    }

    return {
      ...base,
      nodes: { ...nodes, [base.root]: { ...root, children: specs.map((spec) => spec.id) } },
    }
  }

  it("finds nothing in a chain", () => {
    const document = documentOf([
      { id: "a", props: { name: "a" } },
      { id: "b", props: { name: "b", showWhen: { field: "a", operator: "exists" } } },
      { id: "c", props: { name: "c", showWhen: { field: "b", operator: "exists" } } },
    ])

    expect(conditionCycles.validate(document)).toEqual([])
  })

  it("reports two fields waiting for each other", () => {
    const document = documentOf([
      { id: "a", props: { name: "a", showWhen: { field: "b", operator: "exists" } } },
      { id: "b", props: { name: "b", showWhen: { field: "a", operator: "exists" } } },
    ])
    const [issue] = conditionCycles.validate(document)

    expect(issue?.severity).toBe("error")
    expect(issue?.message).toContain("a, b")
    expect(issue?.nodeIds).toEqual(["a", "b"])
  })

  it("reports a longer ring", () => {
    const document = documentOf([
      { id: "a", props: { name: "a", showWhen: { field: "c", operator: "exists" } } },
      { id: "b", props: { name: "b", showWhen: { field: "a", operator: "exists" } } },
      { id: "c", props: { name: "c", showWhen: { field: "b", operator: "exists" } } },
    ])

    expect(conditionCycles.validate(document)[0]?.message).toContain("a, b, c")
  })

  it("reports a field waiting for itself", () => {
    const document = documentOf([
      { id: "a", props: { name: "a", showWhen: { field: "a", operator: "exists" } } },
    ])

    expect(conditionCycles.validate(document)).toHaveLength(1)
  })

  it("does not resolve the cycle, because there is no right half to keep", () => {
    // Guessing would hide a question from a customer that the merchant
    // believes is on the page.
    const document = documentOf([
      { id: "a", props: { name: "a", showWhen: { field: "b", operator: "exists" } } },
      { id: "b", props: { name: "b", showWhen: { field: "a", operator: "exists" } } },
    ])

    expect(conditionCycles.validate(document)[0]?.message).toMatch(/none of them can appear/)
  })
})

describe("a condition the merchant wrote badly", () => {
  it("is ignored when it names no field", () => {
    render(
      form([
        { definition: input, id: "a", props: { label: "Name", showWhen: { operator: "exists" } } },
      ]),
    )

    expect(screen.getByLabelText("Name")).toBeInstanceOf(HTMLInputElement)
  })

  it("is ignored when its operator is not one", () => {
    render(
      form([
        {
          definition: input,
          id: "a",
          props: { label: "Name", showWhen: { field: "x", operator: "sometimes" } },
        },
      ]),
    )

    expect(screen.getByLabelText("Name")).toBeInstanceOf(HTMLInputElement)
  })
})
