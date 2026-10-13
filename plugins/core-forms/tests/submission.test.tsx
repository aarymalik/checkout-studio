import { createDocument } from "@checkout-studio/schema"
import type { CheckoutSchema, Node, PropValue } from "@checkout-studio/schema"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactElement, ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { input } from "../src/components/input/definition"
import { select } from "../src/components/choice/definitions"
import { FormProvider } from "../src/form/FormProvider"
import { checkSubmission, fieldsIn } from "../src/form/submission"
import { nodeOf } from "./support"

afterEach(() => {
  vi.unstubAllGlobals()
})

/** A document holding these field nodes. */
function documentOf(
  specs: readonly { id: string; type: string; props: Record<string, PropValue> }[],
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
      ...nodeOf(spec.type, { id: spec.id, props: spec.props }),
      parentId: base.root,
    }
  }

  return {
    ...base,
    nodes: { ...nodes, [base.root]: { ...root, children: specs.map((spec) => spec.id) } },
  }
}

const EMAIL_AND_NOTE = documentOf([
  {
    id: "a",
    type: "core.input",
    props: { name: "email", kind: "email", label: "Email", required: true },
  },
  { id: "b", type: "core.input", props: { name: "note", label: "Note" } },
])

describe("what the server asks of a submission", () => {
  it("reads the fields from the document, not from the payload", () => {
    expect(fieldsIn(EMAIL_AND_NOTE).map((spec) => spec.name)).toEqual(["email", "note"])
  })

  it("accepts a payload that answers what the page asked", () => {
    const { errors, values } = checkSubmission(EMAIL_AND_NOTE, {
      email: "someone@example.test",
      note: "",
    })

    expect(errors).toEqual({})
    expect(values).toEqual({ email: "someone@example.test", note: "" })
  })

  it("refuses a payload that simply leaves a required field out", () => {
    /*
     * The reason the fields come from the document. Believing the payload
     * about which fields existed would make every rule optional — omitting one
     * would pass by saying nothing.
     */
    const { errors } = checkSubmission(EMAIL_AND_NOTE, { note: "hello" })

    expect(errors["email"]).toMatch(/required/)
  })

  it("applies the same rules the browser did", () => {
    expect(checkSubmission(EMAIL_AND_NOTE, { email: "someone@" }).errors["email"]).toMatch(
      /email address/,
    )
  })

  it("drops a field the page does not ask for", () => {
    // A stale tab submitting a field the merchant has since removed is
    // ordinary; storing it would let anybody write what they liked into a
    // page's submissions.
    const { values, errors } = checkSubmission(EMAIL_AND_NOTE, {
      email: "someone@example.test",
      note: "",
      sneaky: "<script>alert(1)</script>",
    })

    expect(errors).toEqual({})
    expect(values["sneaky"]).toBeUndefined()
  })

  it("does not ask for a field whose condition the payload does not meet", () => {
    const conditional = documentOf([
      {
        id: "a",
        type: "core.select",
        props: {
          name: "delivery",
          label: "Delivery",
          required: true,
          options: [
            { value: "collect", label: "Collect" },
            { value: "ship", label: "Ship" },
          ],
        },
      },
      {
        id: "b",
        type: "core.input",
        props: {
          name: "address",
          label: "Address",
          required: true,
          showWhen: { field: "delivery", operator: "equals", value: "ship" },
        },
      },
    ])

    expect(checkSubmission(conditional, { delivery: "collect" }).errors).toEqual({})
    expect(checkSubmission(conditional, { delivery: "ship" }).errors["address"]).toMatch(/required/)
  })

  it("keeps a value that is only text, whatever it looks like", () => {
    /*
     * An XSS payload in a field is a string. It is stored as one and escaped
     * wherever it is displayed — by React in the dashboard, which is what
     * makes this a storage question rather than a filtering one.
     */
    const { values, errors } = checkSubmission(EMAIL_AND_NOTE, {
      email: "someone@example.test",
      note: "<img src=x onerror=alert(1)>",
    })

    expect(errors).toEqual({})
    expect(values["note"]).toBe("<img src=x onerror=alert(1)>")
  })
})

/** A form with an email field and a submit button. */
function form(): ReactElement {
  const Input = input.renderer
  const Select = select.renderer

  return (
    <FormProvider pageId="pag_t">
      <Input
        node={nodeOf("core.input", { id: "a" })}
        props={{
          ...input.defaultProps,
          name: "email",
          kind: "email",
          label: "Email",
          required: true,
        }}
        className="ck-test"
        mode="published"
      >
        {null as ReactNode}
      </Input>
      <Select
        node={nodeOf("core.select", { id: "b" })}
        props={{
          ...select.defaultProps,
          name: "delivery",
          label: "Delivery",
          required: true,
          options: [{ value: "ship", label: "Ship" }],
        }}
        className="ck-test"
        mode="published"
      >
        {null as ReactNode}
      </Select>
      <button type="submit">Pay now</button>
    </FormProvider>
  )
}

describe("pressing the button", () => {
  it("checks every field before sending anything", async () => {
    // A form with two problems shows two, rather than one and then another
    // after a round trip.
    const fetched = vi.fn()

    vi.stubGlobal("fetch", fetched)
    render(form())

    await userEvent.click(screen.getByRole("button", { name: "Pay now" }))

    expect(await screen.findByText("Email is required.")).toBeVisible()
    expect(screen.getByText("Delivery is required.")).toBeVisible()
    expect(fetched).not.toHaveBeenCalled()
  })

  it("moves focus to the first thing that is wrong", async () => {
    // The first in document order: a person corrects a form from the top, and
    // being dropped at the last problem means scrolling back to find the
    // first.
    vi.stubGlobal("fetch", vi.fn())
    render(form())

    await userEvent.click(screen.getByRole("button", { name: "Pay now" }))

    await waitFor(() => expect(screen.getByLabelText(/Email/)).toHaveFocus())
  })

  it("says how much is wrong, where a screen reader will hear it", async () => {
    vi.stubGlobal("fetch", vi.fn())
    render(form())

    await userEvent.click(screen.getByRole("button", { name: "Pay now" }))

    const status = await screen.findByRole("status")

    expect(status).toHaveTextContent("2 answers need fixing.")
  })

  it("sends the answers once everything is filled in", async () => {
    const fetched = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ id: "sub_1" }),
    })

    vi.stubGlobal("fetch", fetched)
    render(form())

    await userEvent.type(screen.getByLabelText(/Email/), "someone@example.test")
    await userEvent.selectOptions(screen.getByLabelText(/Delivery/), "ship")
    await userEvent.click(screen.getByRole("button", { name: "Pay now" }))

    await waitFor(() => expect(fetched).toHaveBeenCalledTimes(1))

    const body = JSON.parse((fetched.mock.calls[0]?.[1] as { body: string }).body) as {
      pageId: string
      payload: Record<string, string>
      idempotencyKey: string
    }

    expect(body.pageId).toBe("pag_t")
    expect(body.payload).toEqual({ email: "someone@example.test", delivery: "ship" })
    expect(body.idempotencyKey).not.toBe("")
  })

  it("shows the server's own objection on the field it is about", async () => {
    /*
     * The server checked the page's document rather than believing the
     * browser, so it can disagree — and when it does, the person has to be
     * told where rather than just that something went wrong.
     */
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: () => Promise.resolve({ errors: { email: "That address is not accepted." } }),
      }),
    )
    render(form())

    await userEvent.type(screen.getByLabelText(/Email/), "someone@example.test")
    await userEvent.selectOptions(screen.getByLabelText(/Delivery/), "ship")
    await userEvent.click(screen.getByRole("button", { name: "Pay now" }))

    expect(await screen.findByText("That address is not accepted.")).toBeVisible()
  })

  it("keeps its key when the network fails, so a retry is not a second order", async () => {
    const fetched = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ ok: true, status: 201, json: () => Promise.resolve({ id: "sub_1" }) })

    vi.stubGlobal("fetch", fetched)
    render(form())

    await userEvent.type(screen.getByLabelText(/Email/), "someone@example.test")
    await userEvent.selectOptions(screen.getByLabelText(/Delivery/), "ship")
    await userEvent.click(screen.getByRole("button", { name: "Pay now" }))

    expect(await screen.findByText(/Check your connection/)).toBeVisible()

    await userEvent.click(screen.getByRole("button", { name: "Pay now" }))
    await waitFor(() => expect(fetched).toHaveBeenCalledTimes(2))

    const first = JSON.parse((fetched.mock.calls[0]?.[1] as { body: string }).body) as {
      idempotencyKey: string
    }
    const second = JSON.parse((fetched.mock.calls[1]?.[1] as { body: string }).body) as {
      idempotencyKey: string
    }

    expect(second.idempotencyKey).toBe(first.idempotencyKey)
  })

  it("takes a fresh key after one succeeds, so a second order is possible", async () => {
    const fetched = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 201, json: () => Promise.resolve({ id: "sub_1" }) })

    vi.stubGlobal("fetch", fetched)
    render(form())

    await userEvent.type(screen.getByLabelText(/Email/), "someone@example.test")
    await userEvent.selectOptions(screen.getByLabelText(/Delivery/), "ship")
    await userEvent.click(screen.getByRole("button", { name: "Pay now" }))
    await waitFor(() => expect(fetched).toHaveBeenCalledTimes(1))

    await userEvent.click(screen.getByRole("button", { name: "Pay now" }))
    await waitFor(() => expect(fetched).toHaveBeenCalledTimes(2))

    const first = JSON.parse((fetched.mock.calls[0]?.[1] as { body: string }).body) as {
      idempotencyKey: string
    }
    const second = JSON.parse((fetched.mock.calls[1]?.[1] as { body: string }).body) as {
      idempotencyKey: string
    }

    expect(second.idempotencyKey).not.toBe(first.idempotencyKey)
  })
})
