import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PagesPanel, type PageSummary } from "./PagesPanel"
import { expectNoViolations } from "../../tests/axe"

/**
 * The Pages panel.
 *
 * The list comes from the server and is refreshed through the router after a
 * change, rather than mirrored into local state — two copies of a list disagree
 * the moment one of them fails to update.
 */

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }))

const PAGES: PageSummary[] = [
  {
    id: "pag_one",
    title: "Checkout",
    slug: "checkout",
    status: "published",
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
  {
    id: "pag_two",
    title: "Upsell",
    slug: "upsell",
    status: "draft",
    updatedAt: "2026-09-02T00:00:00.000Z",
  },
]

type Call = { url: string; method: string; body: unknown }

describe("PagesPanel", () => {
  let calls: Call[]
  let answer: { ok: boolean; payload?: unknown; message?: string }

  function renderPanel(
    pages: readonly PageSummary[] = PAGES,
    currentPageId: string | null = "pag_one",
  ) {
    return render(<PagesPanel projectId="prj_one" pages={pages} currentPageId={currentPageId} />)
  }

  beforeEach(() => {
    calls = []
    answer = { ok: true }
    push.mockClear()
    refresh.mockClear()

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
        calls.push({
          url,
          method: init?.method ?? "GET",
          body: init?.body === undefined ? undefined : JSON.parse(init.body),
        })

        const envelope = answer.ok
          ? { success: true, data: answer.payload ?? {}, error: null, meta: {} }
          : {
              success: false,
              data: null,
              error: { code: "VALIDATION_ERROR", message: answer.message },
              meta: {},
            }

        return new Response(JSON.stringify(envelope), {
          headers: { "content-type": "application/json" },
        })
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("lists the pages it was given", () => {
    renderPanel()

    expect(screen.getByRole("button", { name: /^Checkout/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Upsell/ })).toBeInTheDocument()
  })

  it("marks the page being edited", () => {
    renderPanel()

    expect(screen.getByRole("button", { name: /^Checkout/ })).toHaveAttribute(
      "aria-current",
      "page",
    )
    expect(screen.getByRole("button", { name: /^Upsell/ })).not.toHaveAttribute("aria-current")
  })

  it("says which pages are live", () => {
    renderPanel()

    expect(screen.getByRole("button", { name: /^Checkout/ })).toHaveTextContent("Live")
    expect(screen.getByRole("button", { name: /^Upsell/ })).not.toHaveTextContent("Live")
  })

  it("offers an empty state with a way out of it", () => {
    renderPanel([], null)

    expect(screen.getByText("No pages yet")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /New page/ })).toBeInTheDocument()
  })

  // Opening a page is a navigation: the document is resolved on the server.
  it("opens a page by navigating to it", async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole("button", { name: /^Upsell/ }))

    expect(push).toHaveBeenCalledWith("/projects/prj_one?page=pag_two")
  })

  describe("creating", () => {
    it("posts the title and opens what it created", async () => {
      const user = userEvent.setup()
      answer = { ok: true, payload: { page: { ...PAGES[0], id: "pag_new" } } }
      renderPanel()

      await user.click(screen.getByRole("button", { name: /New page/ }))
      await user.type(screen.getByRole("textbox", { name: "Name" }), "Thank you")
      await user.click(screen.getByRole("button", { name: "Create page" }))

      await waitFor(() => {
        expect(push).toHaveBeenCalledWith("/projects/prj_one?page=pag_new")
      })

      expect(calls).toEqual([
        { url: "/api/projects/prj_one/pages", method: "POST", body: { title: "Thank you" } },
      ])
    })

    it("says what went wrong and stays open", async () => {
      const user = userEvent.setup()
      answer = { ok: false, message: "That name is not allowed." }
      renderPanel()

      await user.click(screen.getByRole("button", { name: /New page/ }))
      await user.type(screen.getByRole("textbox", { name: "Name" }), "Thank you")
      await user.click(screen.getByRole("button", { name: "Create page" }))

      await waitFor(() => {
        expect(screen.getByText("That name is not allowed.")).toBeInTheDocument()
      })

      expect(push).not.toHaveBeenCalled()
    })
  })

  describe("renaming", () => {
    it("patches the title and refreshes the list", async () => {
      const user = userEvent.setup()
      renderPanel()

      await user.click(screen.getByRole("button", { name: "Actions for Checkout" }))
      await user.click(screen.getByRole("menuitem", { name: "Rename" }))

      const field = screen.getByRole("textbox", { name: "Name" })
      await user.clear(field)
      await user.type(field, "Order form")
      await user.click(screen.getByRole("button", { name: "Save" }))

      await waitFor(() => {
        expect(refresh).toHaveBeenCalled()
      })

      expect(calls).toEqual([
        { url: "/api/pages/pag_one", method: "PATCH", body: { title: "Order form" } },
      ])
    })

    // A published page's URL is a link somebody may have shared, so renaming
    // leaves it alone.
    it("does not move a page that was only renamed", async () => {
      const user = userEvent.setup()
      renderPanel()

      await user.click(screen.getByRole("button", { name: "Actions for Checkout" }))
      await user.click(screen.getByRole("menuitem", { name: "Rename" }))

      const field = screen.getByRole("textbox", { name: "Name" })
      await user.clear(field)
      await user.type(field, "Order form")
      await user.click(screen.getByRole("button", { name: "Save" }))

      await waitFor(() => {
        expect(calls).toHaveLength(1)
      })
      expect(calls[0]?.body).not.toHaveProperty("slug")
    })

    it("asks for nothing when nothing changed", async () => {
      const user = userEvent.setup()
      renderPanel()

      await user.click(screen.getByRole("button", { name: "Actions for Checkout" }))
      await user.click(screen.getByRole("menuitem", { name: "Rename" }))
      await user.click(screen.getByRole("button", { name: "Save" }))

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull()
      })
      expect(calls).toEqual([])
    })
  })

  describe("moving a page to another address", () => {
    async function openDetails(user: ReturnType<typeof userEvent.setup>, name = "Checkout") {
      await user.click(screen.getByRole("button", { name: `Actions for ${name}` }))
      await user.click(screen.getByRole("menuitem", { name: "Rename" }))
    }

    it("patches the slug alone when only the address changed", async () => {
      const user = userEvent.setup()
      renderPanel()
      await openDetails(user)

      const field = screen.getByRole("textbox", { name: "Address" })
      await user.clear(field)
      await user.type(field, "black-friday")
      await user.click(screen.getByRole("button", { name: "Save" }))

      await waitFor(() => {
        expect(refresh).toHaveBeenCalled()
      })

      // A move is rate-limited and consequential in a way a rename is not, so
      // only what changed is sent.
      expect(calls).toEqual([
        { url: "/api/pages/pag_one", method: "PATCH", body: { slug: "black-friday" } },
      ])
    })

    it("sends both when both changed", async () => {
      const user = userEvent.setup()
      renderPanel()
      await openDetails(user)

      const name = screen.getByRole("textbox", { name: "Name" })
      await user.clear(name)
      await user.type(name, "Black Friday")

      const address = screen.getByRole("textbox", { name: "Address" })
      await user.clear(address)
      await user.type(address, "black-friday")
      await user.click(screen.getByRole("button", { name: "Save" }))

      await waitFor(() => {
        expect(calls).toHaveLength(1)
      })
      expect(calls[0]?.body).toEqual({ title: "Black Friday", slug: "black-friday" })
    })

    it("shows what the address will become as it is typed", async () => {
      const user = userEvent.setup()
      renderPanel()
      // The draft page, so the live-page warning does not also render the
      // address and leave two matches to pick between.
      await openDetails(user, "Upsell")

      const field = screen.getByRole("textbox", { name: "Address" })
      await user.clear(field)
      await user.type(field, "Black Friday!")

      // Accepted and corrected, with the result shown before Save rather than
      // applied silently after it.
      expect(screen.getByText("/black-friday")).toBeInTheDocument()
    })

    it("sends the corrected address, not what was typed", async () => {
      const user = userEvent.setup()
      renderPanel()
      await openDetails(user)

      const field = screen.getByRole("textbox", { name: "Address" })
      await user.clear(field)
      await user.type(field, "Black Friday!")
      await user.click(screen.getByRole("button", { name: "Save" }))

      await waitFor(() => {
        expect(calls).toHaveLength(1)
      })
      expect(calls[0]?.body).toEqual({ slug: "black-friday" })
    })

    it("warns before moving a page that is live", async () => {
      const user = userEvent.setup()
      renderPanel()
      await openDetails(user)

      const field = screen.getByRole("textbox", { name: "Address" })
      await user.clear(field)
      await user.type(field, "black-friday")

      expect(screen.getByText("This page is live")).toBeInTheDocument()
    })

    it("does not warn when the page is not live", async () => {
      const user = userEvent.setup()
      renderPanel()
      await openDetails(user, "Upsell")

      const field = screen.getByRole("textbox", { name: "Address" })
      await user.clear(field)
      await user.type(field, "black-friday")

      // Nothing points at an unpublished page, so there is nothing to break.
      expect(screen.queryByText("This page is live")).toBeNull()
    })

    it("does not warn for a rename alone", async () => {
      const user = userEvent.setup()
      renderPanel()
      await openDetails(user)

      const field = screen.getByRole("textbox", { name: "Name" })
      await user.clear(field)
      await user.type(field, "Order form")

      // A notice on every edit is noise everybody learns to ignore.
      expect(screen.queryByText("This page is live")).toBeNull()
    })

    it("will not save an address with nothing in it", async () => {
      const user = userEvent.setup()
      renderPanel()
      await openDetails(user)

      const field = screen.getByRole("textbox", { name: "Address" })
      await user.clear(field)
      await user.type(field, "！！！")

      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
      expect(screen.getByText("An address needs a letter or a number.")).toBeInTheDocument()
    })

    it("shows the address the page already has", async () => {
      const user = userEvent.setup()
      renderPanel()
      await openDetails(user)

      expect(screen.getByRole("textbox", { name: "Address" })).toHaveValue("checkout")
    })
  })

  describe("duplicating", () => {
    it("posts to the duplicate endpoint and refreshes", async () => {
      const user = userEvent.setup()
      renderPanel()

      await user.click(screen.getByRole("button", { name: "Actions for Checkout" }))
      await user.click(screen.getByRole("menuitem", { name: "Duplicate" }))

      await waitFor(() => {
        expect(refresh).toHaveBeenCalled()
      })

      expect(calls).toEqual([{ url: "/api/pages/pag_one/duplicate", method: "POST", body: {} }])
    })

    it("says so when a page cannot be copied", async () => {
      const user = userEvent.setup()
      answer = { ok: false, message: "This page's content cannot be read, so it cannot be copied." }
      renderPanel()

      await user.click(screen.getByRole("button", { name: "Actions for Checkout" }))
      await user.click(screen.getByRole("menuitem", { name: "Duplicate" }))

      await waitFor(() => {
        expect(screen.getByText(/cannot be read/)).toBeInTheDocument()
      })
    })
  })

  describe("deleting", () => {
    async function openTheDialog(user: ReturnType<typeof userEvent.setup>): Promise<void> {
      await user.click(screen.getByRole("button", { name: "Actions for Checkout" }))
      await user.click(screen.getByRole("menuitem", { name: "Delete" }))
    }

    it("confirms first", async () => {
      const user = userEvent.setup()
      renderPanel()

      await openTheDialog(user)

      expect(screen.getByRole("dialog", { name: "Delete Checkout?" })).toBeInTheDocument()
      expect(calls).toEqual([])
    })

    it("does nothing when the confirmation is declined", async () => {
      const user = userEvent.setup()
      renderPanel()

      await openTheDialog(user)
      await user.click(screen.getByRole("button", { name: "Keep it" }))

      expect(calls).toEqual([])
    })

    it("deletes and refreshes", async () => {
      const user = userEvent.setup()
      renderPanel()

      await openTheDialog(user)
      await user.click(screen.getByRole("button", { name: "Delete page" }))

      await waitFor(() => {
        expect(refresh).toHaveBeenCalled()
      })

      expect(calls).toEqual([{ url: "/api/pages/pag_one", method: "DELETE", body: undefined }])
    })
  })

  describe("accessibility", () => {
    it("reports no axe violations", async () => {
      const { container } = renderPanel()

      await expectNoViolations(container)
    })

    it("reports none for the empty state", async () => {
      const { container } = renderPanel([], null)

      await expectNoViolations(container)
    })

    it("names each row's menu after the page it acts on", () => {
      renderPanel()

      for (const page of PAGES) {
        expect(
          screen.getByRole("button", { name: `Actions for ${page.title}` }),
        ).toBeInTheDocument()
      }
    })

    it("marks the list busy while the page refreshes", () => {
      const { container } = renderPanel()

      expect(within(container).getByRole("list")).toBeInTheDocument()
    })
  })
})
