import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ProjectList, type ProjectSummary } from "./ProjectList"
import { expectNoViolations } from "../../../tests/axe"

/**
 * The dashboard.
 *
 * Creating, renaming and deleting a project, and the undo that makes the delete
 * dialog honest rather than frightening.
 */

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}))

const PROJECTS: ProjectSummary[] = [
  {
    id: "one",
    name: "Spring Sale",
    slug: "spring-sale",
    description: "The launch checkout",
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
  {
    id: "two",
    name: "Black Friday",
    slug: "black-friday",
    description: null,
    updatedAt: "2026-09-02T00:00:00.000Z",
  },
]

type Call = { url: string; method: string; body: unknown }

describe("ProjectList", () => {
  let calls: Call[]
  let answer: { ok: boolean; payload?: unknown; message?: string }

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

  it("lists what it was given", () => {
    render(<ProjectList email="someone@example.test" projects={PROJECTS} />)

    expect(screen.getByRole("link", { name: /Spring Sale/ })).toHaveAttribute(
      "href",
      "/projects/one",
    )
    expect(screen.getByRole("link", { name: /Black Friday/ })).toBeInTheDocument()
  })

  it("falls back to the slug for a project with no description", () => {
    render(<ProjectList email="someone@example.test" projects={PROJECTS} />)

    expect(screen.getByRole("link", { name: /Black Friday/ })).toHaveTextContent("black-friday")
  })

  it("offers an empty state with a way out of it", () => {
    render(<ProjectList email="someone@example.test" projects={[]} />)

    expect(screen.getByText("No projects yet")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Create your first project" })).toBeInTheDocument()
  })

  describe("creating", () => {
    it("posts the name and goes straight into the editor", async () => {
      const user = userEvent.setup()
      answer = { ok: true, payload: { project: { ...PROJECTS[0], id: "new" } } }
      render(<ProjectList email="someone@example.test" projects={[]} />)

      await user.click(screen.getByRole("button", { name: "Create your first project" }))
      await user.type(screen.getByRole("textbox", { name: "Name" }), "Winter")
      await user.click(screen.getByRole("button", { name: "Create project" }))

      await waitFor(() => {
        expect(push).toHaveBeenCalledWith("/projects/new")
      })

      expect(calls).toEqual([{ url: "/api/projects", method: "POST", body: { name: "Winter" } }])
    })

    it("sends a description when one was given", async () => {
      const user = userEvent.setup()
      answer = { ok: true, payload: { project: { ...PROJECTS[0], id: "new" } } }
      render(<ProjectList email="someone@example.test" projects={[]} />)

      await user.click(screen.getByRole("button", { name: "Create your first project" }))
      await user.type(screen.getByRole("textbox", { name: "Name" }), "Winter")
      await user.type(screen.getByRole("textbox", { name: "Description" }), "Boxing day")
      await user.click(screen.getByRole("button", { name: "Create project" }))

      await waitFor(() => {
        expect(calls[0]?.body).toEqual({ name: "Winter", description: "Boxing day" })
      })
    })

    it("says what went wrong and stays open", async () => {
      const user = userEvent.setup()
      answer = { ok: false, message: "You have reached your plan's project limit." }
      render(<ProjectList email="someone@example.test" projects={[]} />)

      await user.click(screen.getByRole("button", { name: "Create your first project" }))
      await user.type(screen.getByRole("textbox", { name: "Name" }), "Winter")
      await user.click(screen.getByRole("button", { name: "Create project" }))

      await waitFor(() => {
        expect(screen.getByText("You have reached your plan's project limit.")).toBeInTheDocument()
      })

      expect(push).not.toHaveBeenCalled()
      expect(screen.getByRole("dialog")).toBeInTheDocument()
    })
  })

  describe("renaming", () => {
    it("patches the name and refreshes the list", async () => {
      const user = userEvent.setup()
      render(<ProjectList email="someone@example.test" projects={PROJECTS} />)

      await user.click(screen.getByRole("button", { name: "Actions for Spring Sale" }))
      await user.click(screen.getByRole("menuitem", { name: "Rename" }))

      const field = screen.getByRole("textbox", { name: "Name" })
      await user.clear(field)
      await user.type(field, "Spring Launch")
      await user.click(screen.getByRole("button", { name: "Save" }))

      await waitFor(() => {
        expect(refresh).toHaveBeenCalled()
      })

      expect(calls).toEqual([
        { url: "/api/projects/one", method: "PATCH", body: { name: "Spring Launch" } },
      ])
    })

    // Renaming must not move a URL somebody shared.
    it("does not ask the server to change the slug", async () => {
      const user = userEvent.setup()
      render(<ProjectList email="someone@example.test" projects={PROJECTS} />)

      await user.click(screen.getByRole("button", { name: "Actions for Spring Sale" }))
      await user.click(screen.getByRole("menuitem", { name: "Rename" }))
      await user.click(screen.getByRole("button", { name: "Save" }))

      await waitFor(() => {
        expect(calls[0]?.body).not.toHaveProperty("slug")
      })
    })
  })

  describe("deleting", () => {
    async function openTheDialog(user: ReturnType<typeof userEvent.setup>): Promise<void> {
      await user.click(screen.getByRole("button", { name: "Actions for Spring Sale" }))
      await user.click(screen.getByRole("menuitem", { name: "Delete" }))
    }

    it("confirms first", async () => {
      const user = userEvent.setup()
      render(<ProjectList email="someone@example.test" projects={PROJECTS} />)

      await openTheDialog(user)

      expect(screen.getByRole("dialog", { name: "Delete Spring Sale?" })).toBeInTheDocument()
      expect(calls).toEqual([])
    })

    it("does nothing when the confirmation is declined", async () => {
      const user = userEvent.setup()
      render(<ProjectList email="someone@example.test" projects={PROJECTS} />)

      await openTheDialog(user)
      await user.click(screen.getByRole("button", { name: "Keep it" }))

      expect(calls).toEqual([])
    })

    it("deletes, and offers the undo that makes the dialog honest", async () => {
      const user = userEvent.setup()
      render(<ProjectList email="someone@example.test" projects={PROJECTS} />)

      await openTheDialog(user)
      await user.click(screen.getByRole("button", { name: "Delete project" }))

      await waitFor(() => {
        expect(screen.getByText("Spring Sale was deleted")).toBeInTheDocument()
      })

      expect(calls).toEqual([{ url: "/api/projects/one", method: "DELETE", body: undefined }])
      expect(refresh).toHaveBeenCalled()
    })

    it("restores it", async () => {
      const user = userEvent.setup()
      render(<ProjectList email="someone@example.test" projects={PROJECTS} />)

      await openTheDialog(user)
      await user.click(screen.getByRole("button", { name: "Delete project" }))

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument()
      })

      await user.click(screen.getByRole("button", { name: "Undo" }))

      await waitFor(() => {
        expect(calls.at(-1)).toEqual({ url: "/api/projects/one", method: "POST", body: {} })
      })

      expect(screen.queryByText("Spring Sale was deleted")).not.toBeInTheDocument()
    })

    it("says so when the delete failed", async () => {
      const user = userEvent.setup()
      answer = { ok: false, message: "That project is already gone." }
      render(<ProjectList email="someone@example.test" projects={PROJECTS} />)

      await openTheDialog(user)
      await user.click(screen.getByRole("button", { name: "Delete project" }))

      await waitFor(() => {
        expect(screen.getByText("That project is already gone.")).toBeInTheDocument()
      })

      expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument()
    })
  })

  describe("accessibility", () => {
    it("reports no axe violations", async () => {
      const { container } = render(<ProjectList email="someone@example.test" projects={PROJECTS} />)

      await expectNoViolations(container)
    })

    it("reports none for the empty state", async () => {
      const { container } = render(<ProjectList email="someone@example.test" projects={[]} />)

      await expectNoViolations(container)
    })

    it("names each row's menu after the project it acts on", () => {
      render(<ProjectList email="someone@example.test" projects={PROJECTS} />)

      for (const project of PROJECTS) {
        expect(
          screen.getByRole("button", { name: `Actions for ${project.name}` }),
        ).toBeInTheDocument()
      }
    })

    it("keeps the list marked busy while the page refreshes", () => {
      render(<ProjectList email="someone@example.test" projects={PROJECTS} />)

      expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(2)
    })
  })
})
