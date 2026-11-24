import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EmbedDialog } from "./EmbedDialog"
import { expectNoViolations } from "../../../tests/axe"

/**
 * Putting a checkout on somebody else's site.
 *
 * The list is reloaded from the server after every change rather than
 * mirrored locally, because the server normalises what was typed and the
 * row it stored is the truth about what will be in the header. These check
 * that, and that a refusal lands under the box it was typed into.
 */

interface Call {
  url: string
  method: string
  body: unknown
}

const ORIGINS = [
  { id: "eor_1", origin: "https://shop.example", verified: false },
  { id: "eor_2", origin: "https://www.shop.example", verified: true },
]

describe("EmbedDialog", () => {
  let calls: Call[]
  let answers: Array<{ ok: boolean; payload?: unknown; message?: string; field?: string }>

  function renderDialog() {
    return render(
      <EmbedDialog
        pageId="pag_one"
        pageTitle="Checkout"
        rendererOrigin="https://checkout.example.com"
        pinned={{ path: "/embed/v9.js", integrity: "sha384-TESTHASH" }}
        open
        onOpenChange={() => undefined}
      />,
    )
  }

  beforeEach(() => {
    calls = []
    answers = [{ ok: true, payload: { origins: ORIGINS } }]

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
        calls.push({
          url,
          method: init?.method ?? "GET",
          body: init?.body === undefined ? undefined : JSON.parse(init.body),
        })

        const answer = answers.shift() ?? { ok: true, payload: { origins: ORIGINS } }
        const envelope = answer.ok
          ? { success: true, data: answer.payload ?? {}, error: null, meta: {} }
          : {
              success: false,
              data: null,
              error: {
                code: "VALIDATION_ERROR",
                /*
                 * Deliberately not the sentence being asserted. The route
                 * sends the specific complaint as a field detail and the
                 * envelope carries this generic one, so a dialog that read
                 * the envelope instead would show the wrong thing — and if
                 * both strings matched here, nothing would notice.
                 */
                message: "Check the highlighted fields.",
                details:
                  answer.field === undefined
                    ? undefined
                    : [{ path: answer.field, code: "invalid", message: answer.message }],
              },
              meta: {},
            }

        return new Response(JSON.stringify(envelope), {
          headers: { "content-type": "application/json" },
          status: answer.ok ? 200 : 422,
        })
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("shows the snippet with this checkout's id and origin", async () => {
    renderDialog()

    await screen.findByText(
      '<script src="https://checkout.example.com/embed.js" data-checkout-id="pag_one"></script>',
    )
  })

  it("lists the domains the page has", async () => {
    renderDialog()

    expect(await screen.findByText("https://shop.example")).toBeInTheDocument()
    expect(screen.getByText("https://www.shop.example")).toBeInTheDocument()
  })

  it("says plainly that an unlisted checkout loads nowhere", async () => {
    answers = [{ ok: true, payload: { origins: [] } }]

    renderDialog()

    /*
     * The alternative is a merchant pasting the snippet, seeing nothing,
     * and having no way to know this list is the reason.
     */
    expect(await screen.findByText(/will not load anywhere/iu)).toBeInTheDocument()
  })

  it("registers what was typed and reloads from the server", async () => {
    renderDialog()
    await screen.findByText("https://shop.example")

    answers = [
      { ok: true, payload: { origin: ORIGINS[0], companion: null } },
      { ok: true, payload: { origins: ORIGINS } },
    ]

    await userEvent.type(screen.getByLabelText("Allowed domains"), "shop.example")
    await userEvent.click(screen.getByRole("button", { name: "Add" }))

    await waitFor(() => {
      expect(calls.some((call) => call.method === "POST")).toBe(true)
    })

    const posted = calls.find((call) => call.method === "POST")

    expect(posted?.body).toEqual({ origin: "shop.example" })
    // Reloaded rather than pushed into local state: the server normalises
    // what was typed, so its answer is the one worth drawing.
    expect(calls.filter((call) => call.method === "GET")).toHaveLength(2)
  })

  it("offers the counterpart by putting it in the box, not by adding it", async () => {
    renderDialog()
    await screen.findByText("https://shop.example")

    answers = [
      { ok: true, payload: { origin: ORIGINS[0], companion: "https://www.other.example" } },
      { ok: true, payload: { origins: ORIGINS } },
    ]

    await userEvent.type(screen.getByLabelText("Allowed domains"), "other.example")
    await userEvent.click(screen.getByRole("button", { name: "Add" }))

    /*
     * One press registers it and one keystroke dismisses it. Adding it
     * unasked would put an origin nobody typed into the list that decides
     * who may frame a payment page.
     */
    await waitFor(() => {
      expect(screen.getByLabelText("Allowed domains")).toHaveValue("https://www.other.example")
    })
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(1)
  })

  it("puts a refusal under the box it was typed into", async () => {
    renderDialog()
    await screen.findByText("https://shop.example")

    answers = [
      {
        ok: false,
        field: "origin",
        message: "Wildcards are not accepted. Add each subdomain you use.",
      },
    ]

    await userEvent.type(screen.getByLabelText("Allowed domains"), "*.shop.example")
    await userEvent.click(screen.getByRole("button", { name: "Add" }))

    expect(await screen.findByText(/Wildcards are not accepted/iu)).toBeInTheDocument()
    // Still there to correct, rather than cleared out from under them.
    expect(screen.getByLabelText("Allowed domains")).toHaveValue("*.shop.example")
  })

  it("removes the one whose button was pressed", async () => {
    renderDialog()
    await screen.findByText("https://shop.example")

    answers = [
      { ok: true, payload: {} },
      { ok: true, payload: { origins: [ORIGINS[1]] } },
    ]

    await userEvent.click(screen.getByRole("button", { name: "Remove https://shop.example" }))

    await waitFor(() => {
      expect(calls.some((call) => call.method === "DELETE")).toBe(true)
    })
    expect(calls.find((call) => call.method === "DELETE")?.url).toBe(
      "/api/pages/pag_one/embed-origins/eor_1",
    )
  })

  it("sends nothing for an empty box", async () => {
    renderDialog()
    await screen.findByText("https://shop.example")

    await userEvent.click(screen.getByRole("button", { name: "Add" }))

    expect(calls.filter((call) => call.method === "POST")).toHaveLength(0)
  })

  it("has no accessibility violations", async () => {
    const { container } = renderDialog()

    await screen.findByText("https://shop.example")
    await expectNoViolations(container)
  })

  describe("pinning a version", () => {
    it("offers the living loader by default, with no integrity attribute", async () => {
      renderDialog()

      const snippet = await screen.findByText(/<script/u)

      // The default has to be the one that takes our security fixes.
      expect(snippet.textContent).toContain("/embed.js")
      expect(snippet.textContent).not.toContain("integrity")
    })

    it("offers the frozen build with its hash when asked", async () => {
      renderDialog()
      await screen.findByText(/<script/u)

      await userEvent.click(screen.getByLabelText("Pin this version"))

      const snippet = screen.getByText(/<script/u)

      expect(snippet.textContent).toContain("/embed/v9.js")
      expect(snippet.textContent).toContain('integrity="sha384-TESTHASH"')
      /*
       * Without this a browser sends no credentials but also refuses to
       * check the hash on a cross-origin script, so the integrity attribute
       * would be decorative.
       */
      expect(snippet.textContent).toContain('crossorigin="anonymous"')
    })

    it("says what each choice costs", async () => {
      renderDialog()

      expect(await screen.findByText(/Security fixes reach your page/iu)).toBeInTheDocument()

      await userEvent.click(screen.getByLabelText("Pin this version"))

      // The trade stated rather than decided for them.
      expect(
        screen.getByText(/will not reach it until you take a new snippet/iu),
      ).toBeInTheDocument()
    })

    it("copies whichever one is shown", async () => {
      const writeText = vi.fn(async (_text: string) => undefined)

      vi.stubGlobal("navigator", { clipboard: { writeText } })

      renderDialog()
      await screen.findByText(/<script/u)
      await userEvent.click(screen.getByLabelText("Pin this version"))
      await userEvent.click(screen.getByRole("button", { name: /Copy snippet/u }))

      expect(writeText.mock.calls[0]?.[0]).toContain('integrity="sha384-TESTHASH"')
    })
  })
})
