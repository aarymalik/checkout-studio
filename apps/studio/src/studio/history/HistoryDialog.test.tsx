import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { HistoryDialog } from "./HistoryDialog"
import { expectNoViolations } from "../../../tests/axe"

/**
 * Every version a page has had.
 *
 * The two offers are one request apart and mean different things — one
 * puts a version in the editor, the other puts it in front of customers —
 * so most of these are about keeping them apart.
 */

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }))

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

interface Call {
  url: string
  method: string
  body: unknown
}

const HISTORY = {
  revisions: [
    {
      id: "rev_2",
      number: 2,
      kind: "publish",
      name: null,
      createdAt: "2026-11-02T00:00:00.000Z",
    },
    {
      id: "rev_1",
      number: 1,
      kind: "manual",
      name: "Before the rewrite",
      createdAt: "2026-11-01T00:00:00.000Z",
    },
  ],
  draftVersion: 7,
  publishedRevisionId: "rev_2",
}

describe("HistoryDialog", () => {
  let calls: Call[]
  let answers: Array<{ ok: boolean; payload?: unknown; message?: string; field?: string }>

  function renderDialog() {
    return render(
      <HistoryDialog pageId="pag_1" pageTitle="Checkout" open onOpenChange={() => undefined} />,
    )
  }

  beforeEach(() => {
    calls = []
    answers = []
    refresh.mockClear()

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
        calls.push({
          url,
          method: init?.method ?? "GET",
          body: init?.body === undefined ? undefined : JSON.parse(init.body),
        })

        const answer = answers.shift() ?? { ok: true, payload: HISTORY }
        const envelope = answer.ok
          ? { success: true, data: answer.payload ?? {}, error: null, meta: {} }
          : {
              success: false,
              data: null,
              error: {
                code: "VALIDATION_ERROR",
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

  it("names a saved version by its name and a published one by what it is", async () => {
    renderDialog()

    expect(await screen.findByText("Before the rewrite")).toBeInTheDocument()
    expect(screen.getByText("Published")).toBeInTheDocument()
  })

  it("says which one customers are being served", async () => {
    renderDialog()

    await screen.findByText("Before the rewrite")

    // Otherwise somebody has to work it out from the dates.
    expect(screen.getByLabelText("Live now")).toBeInTheDocument()
  })

  it("will not offer to roll back to the version already live", async () => {
    renderDialog()

    await screen.findByText("Before the rewrite")

    expect(
      screen.getByRole("button", { name: /Put version 2 back in front of customers/u }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: /Put version 1 back in front of customers/u }),
    ).toBeEnabled()
  })

  it("restores with PATCH, which shows nobody", async () => {
    renderDialog()
    await screen.findByText("Before the rewrite")

    answers = [
      { ok: true, payload: { draftVersion: 8 } },
      { ok: true, payload: HISTORY },
    ]

    await userEvent.click(
      screen.getByRole("button", { name: /Restore version 1 into the editor/u }),
    )

    await waitFor(() => {
      expect(calls.some((call) => call.method === "PATCH")).toBe(true)
    })

    const patch = calls.find((call) => call.method === "PATCH")

    expect(patch?.url).toBe("/api/pages/pag_1/revisions/rev_1")
    // The version it was holding, so it loses a race rather than winning
    // one it should not.
    expect(patch?.body).toEqual({ baseVersion: 7 })
  })

  it("rolls back with PUT, which does show somebody", async () => {
    renderDialog()
    await screen.findByText("Before the rewrite")

    answers = [
      { ok: true, payload: { revision: { id: "rev_3", number: 3 }, created: true, warnings: [] } },
      { ok: true, payload: HISTORY },
    ]

    await userEvent.click(
      screen.getByRole("button", { name: /Put version 1 back in front of customers/u }),
    )

    await waitFor(() => {
      expect(calls.some((call) => call.method === "PUT")).toBe(true)
    })
  })

  it("refreshes the editor, which is holding the draft this rewrote", async () => {
    renderDialog()
    await screen.findByText("Before the rewrite")

    answers = [
      { ok: true, payload: { draftVersion: 8 } },
      { ok: true, payload: HISTORY },
    ]

    await userEvent.click(
      screen.getByRole("button", { name: /Restore version 1 into the editor/u }),
    )

    // Without this the canvas keeps showing the page from a moment ago,
    // and the history says something that did not visibly happen.
    await waitFor(() => {
      expect(refresh).toHaveBeenCalled()
    })
  })

  it("re-reads after a refusal, because the version it held may be stale", async () => {
    renderDialog()
    await screen.findByText("Before the rewrite")

    answers = [
      { ok: false, message: "This page was changed in another session." },
      { ok: true, payload: { ...HISTORY, draftVersion: 9 } },
    ]

    await userEvent.click(
      screen.getByRole("button", { name: /Restore version 1 into the editor/u }),
    )

    /*
     * A conflict means somebody else moved the draft, so the version this
     * dialog is holding is the wrong one to try again with.
     */
    await waitFor(() => {
      expect(calls.filter((call) => call.method === "GET")).toHaveLength(2)
    })
    expect(refresh).not.toHaveBeenCalled()
  })

  it("keeps a named version and reloads the list", async () => {
    renderDialog()
    await screen.findByText("Before the rewrite")

    answers = [
      { ok: true, payload: { revision: { id: "rev_3", number: 3 } } },
      { ok: true, payload: HISTORY },
    ]

    await userEvent.type(screen.getByLabelText("Save this version"), "Known good")
    await userEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => {
      expect(calls.find((call) => call.method === "POST")?.body).toEqual({ name: "Known good" })
    })
    expect(calls.filter((call) => call.method === "GET")).toHaveLength(2)
  })

  it("puts a refused name under the box it was typed into", async () => {
    renderDialog()
    await screen.findByText("Before the rewrite")

    answers = [{ ok: false, field: "name", message: "Give this version a name." }]

    await userEvent.type(screen.getByLabelText("Save this version"), "x")
    await userEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(await screen.findByText("Give this version a name.")).toBeInTheDocument()
  })

  it("sends nothing for an empty name", async () => {
    renderDialog()
    await screen.findByText("Before the rewrite")

    await userEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(calls.filter((call) => call.method === "POST")).toHaveLength(0)
  })

  it("says so when a page has no versions", async () => {
    answers = [{ ok: true, payload: { revisions: [], draftVersion: 1, publishedRevisionId: null } }]

    renderDialog()

    expect(await screen.findByText(/No versions yet/u)).toBeInTheDocument()
  })

  it("has no accessibility violations", async () => {
    const { container } = renderDialog()

    await screen.findByText("Before the rewrite")
    await expectNoViolations(container)
  })
})
