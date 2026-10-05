import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  DEBOUNCE_MS,
  EditorProvider,
  useEditorStoreApi,
  type EditorStoreApi,
} from "@checkout-studio/editor"
import { createDocument, serialize, type CheckoutSchema } from "@checkout-studio/schema"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactElement } from "react"

import { Autosave } from "@/studio/autosave/Autosave"
import { EditorStatus } from "@/studio/session/EditorStatus"

import { ConflictPrompt } from "./ConflictPrompt"

/**
 * Choosing which document survives.
 *
 * The conflict is produced the way the product produces one: an edit, a write,
 * and a server that refuses it because the version moved on. Nothing here fakes
 * the conflict state, because the thing most likely to break is the path from
 * the refusal to the prompt.
 */

interface Call {
  url: string
  method: string
  body: { resolution?: string; document?: unknown }
}

/**
 * A page with two sections.
 *
 * Two, so that each side can edit a different one. With a single root the two
 * sides always collide on it — adding a child changes the root's children — and
 * the "you each changed different parts" case would be untestable.
 */
function blank(): CheckoutSchema {
  const created = createDocument({
    projectId: "prj_test",
    pageId: "pag_test",
    themeId: "theme_default",
    random: () => 0.5,
  })
  const root = created.nodes[created.root]!

  const section = (id: string, name: string) => ({
    id,
    type: "core.section",
    parentId: created.root,
    children: [] as string[],
    props: {},
    styles: {},
    visibility: { hidden: false },
    animations: [],
    metadata: { locked: false, name },
  })

  return {
    ...created,
    nodes: {
      ...created.nodes,
      [created.root]: { ...root, children: ["left", "right"] },
      left: section("left", "Left"),
      right: section("right", "Right"),
    },
  }
}

/** Their document: the same page with the right-hand section renamed. */
function theirs(): CheckoutSchema {
  const base = blank()
  const right = base.nodes["right"]!

  return {
    ...base,
    nodes: {
      ...base.nodes,
      right: { ...right, metadata: { locked: false, name: "Renamed by them" } },
    },
  }
}

describe("ConflictPrompt", () => {
  let calls: Call[]
  let store: EditorStoreApi
  let conflicting: boolean
  let failTheirs: string | null
  let unreadableTheirs: boolean
  let failResolve: boolean

  function setup(): void {
    const document = blank()

    function Capture(): ReactElement {
      store = useEditorStoreApi()

      return (
        <>
          <EditorStatus />
          <ConflictPrompt />
        </>
      )
    }

    render(
      <EditorProvider document={document} baseVersion={1}>
        <Autosave document={document}>
          <Capture />
        </Autosave>
      </EditorProvider>,
    )
  }

  async function settle(): Promise<void> {
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  /** Edit, let the debounce fire, and let the server refuse it. */
  async function provoke(): Promise<void> {
    act(() => {
      store.getState().rename("left", "Renamed by me")
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    })
    await settle()
  }

  function callsTo(method: string, fragment: string): Call[] {
    return calls.filter((call) => call.method === method && call.url.includes(fragment))
  }

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    calls = []
    conflicting = true
    failTheirs = null
    unreadableTheirs = false
    failResolve = false

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
        const method = init?.method ?? "GET"

        calls.push({
          url,
          method,
          body: init?.body === undefined ? {} : (JSON.parse(init.body) as Call["body"]),
        })

        const answer = (ok: boolean, data: unknown, code = "DRAFT_CONFLICT") =>
          new Response(
            JSON.stringify(
              ok
                ? { success: true, data, error: null, meta: {} }
                : {
                    success: false,
                    data: null,
                    error: { code, message: "This page was changed in another session." },
                    meta: {},
                  },
            ),
            { headers: { "content-type": "application/json" } },
          )

        // The draft, as the other session left it.
        if (method === "GET" && url.endsWith("/draft")) {
          if (failTheirs !== null) return answer(false, null, failTheirs)

          return answer(true, {
            schema: unreadableTheirs ? { nonsense: true } : JSON.parse(serialize(theirs())),
            draftVersion: 9,
          })
        }

        if (method === "POST" && url.endsWith("/draft/resolve")) {
          if (failResolve) return answer(false, null, "INTERNAL_ERROR")

          const resolution = (JSON.parse(init?.body ?? "{}") as Call["body"]).resolution
          const document = resolution === "mine" ? store.getState().document : theirs()

          return answer(true, {
            schema: JSON.parse(serialize(document)),
            draftVersion: 10,
            recoveryRevisionId: "rev_1",
          })
        }

        // The write that starts all of this.
        if (method === "PATCH") {
          return conflicting ? answer(false, null) : answer(true, { draftVersion: 2 }, "")
        }

        return answer(true, {})
      }),
    )
  })

  afterEach(async () => {
    cleanup()
    await act(async () => {
      await Promise.resolve()
    })
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  describe("appearing", () => {
    it("asks when a write is refused because the version moved on", async () => {
      setup()
      await provoke()

      expect(
        await screen.findByText("This page was changed in another session"),
      ).toBeInTheDocument()
    })

    it("says what each side did, from the version they both started from", async () => {
      setup()
      await provoke()

      await screen.findByText("This page was changed in another session")

      // Only this session holds the base: a draft write creates no revision for
      // the server to reconstruct it from, so the server could not have worked
      // either of these out.
      await waitFor(() => {
        expect(screen.getAllByText("1 node edited")).toHaveLength(2)
      })
    })

    it("says plainly when the two sides did not touch the same thing", async () => {
      setup()
      await provoke()

      // The common case, and the one where either choice loses the least.
      expect(
        await screen.findByText("You each changed different parts of the page."),
      ).toBeInTheDocument()
    })

    it("says when both sides changed the same thing", async () => {
      setup()

      // The same section the other side renamed, which is the case where the
      // choice actually costs somebody something.
      act(() => {
        store.getState().rename("right", "Renamed by me")
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
      })
      await settle()

      expect(await screen.findByText("You both changed the same element.")).toBeInTheDocument()
      expect(screen.queryByText("You each changed different parts of the page.")).toBeNull()
    })

    it("promises that neither side is thrown away", async () => {
      setup()
      await provoke()

      expect(await screen.findByText(/restorable snapshot/)).toBeInTheDocument()
    })
  })

  describe("keeping mine", () => {
    it("sends my document and the choice", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      setup()
      await provoke()
      await screen.findByRole("button", { name: "Keep mine" })

      await user.click(screen.getByRole("button", { name: "Keep mine" }))

      await waitFor(() => {
        expect(callsTo("POST", "/draft/resolve")).toHaveLength(1)
      })

      const sent = callsTo("POST", "/draft/resolve")[0]

      expect(sent?.body.resolution).toBe("mine")
      // Whole, not a patch: there is no agreed base to patch against, and that
      // disagreement is what a conflict is.
      expect(sent?.body.document).toMatchObject({ root: expect.any(String) })
    })

    it("leaves the document alone and moves the version on", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      setup()
      await provoke()
      await screen.findByRole("button", { name: "Keep mine" })

      const before = store.getState().document

      await user.click(screen.getByRole("button", { name: "Keep mine" }))

      await waitFor(() => {
        expect(store.getState().persistence.baseVersion).toBe(10)
      })

      expect(store.getState().document).toBe(before)
      expect(store.getState().persistence.status).toBe("saved")
    })

    it("lets autosave write again afterwards", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      setup()
      await provoke()
      await screen.findByRole("button", { name: "Keep mine" })
      await user.click(screen.getByRole("button", { name: "Keep mine" }))

      await waitFor(() => {
        expect(store.getState().persistence.status).toBe("saved")
      })

      conflicting = false
      calls = []

      act(() => {
        store.getState().rename("left", "After")
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
      })
      await settle()

      // The whole point of resolving: the editor is usable again.
      await waitFor(() => {
        expect(callsTo("PATCH", "/draft")).toHaveLength(1)
      })

      expect(callsTo("PATCH", "/draft")[0]?.body).toMatchObject({ baseVersion: 10 })
    })
  })

  describe("using theirs", () => {
    it("loads their document into the editor", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      setup()
      await provoke()
      await screen.findByRole("button", { name: "Use theirs" })

      await user.click(screen.getByRole("button", { name: "Use theirs" }))

      await waitFor(() => {
        expect(store.getState().document.nodes["right"]?.metadata.name).toBe("Renamed by them")
      })

      // And my own edit is gone from the editor, which is what choosing theirs
      // means — it lives on as the recovery revision the server kept.
      expect(store.getState().document.nodes["left"]?.metadata.name).toBe("Left")

      expect(callsTo("POST", "/draft/resolve")[0]?.body.resolution).toBe("theirs")
      expect(store.getState().persistence.baseVersion).toBe(10)
    })

    it("sends my document too, so it can be kept as a snapshot", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      setup()
      await provoke()
      await screen.findByRole("button", { name: "Use theirs" })
      await user.click(screen.getByRole("button", { name: "Use theirs" }))

      await waitFor(() => {
        expect(callsTo("POST", "/draft/resolve")).toHaveLength(1)
      })

      // The server has never seen it, and it is about to become the restorable
      // side. Not sending it is how "no path discards work" would quietly fail.
      expect(callsTo("POST", "/draft/resolve")[0]?.body.document).toBeDefined()
    })
  })

  describe("putting it aside", () => {
    it("can be dismissed, and brought back from the status bar", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      setup()
      await provoke()
      await screen.findByRole("button", { name: "Keep mine" })

      await user.keyboard("{Escape}")

      await waitFor(() => {
        expect(screen.queryByRole("button", { name: "Keep mine" })).toBeNull()
      })

      /*
       * Autosave stays stopped, so "Not saved" on its own would be a dead end.
       * The way back has to exist.
       */
      await user.click(screen.getByRole("button", { name: "Resolve" }))

      expect(await screen.findByRole("button", { name: "Keep mine" })).toBeInTheDocument()
    })

    it("says in the status bar why nothing is saving", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      setup()
      await provoke()
      await screen.findByRole("button", { name: "Keep mine" })
      await user.keyboard("{Escape}")

      expect(
        await screen.findByText(/this page was changed in another session/),
      ).toBeInTheDocument()
    })
  })

  describe("when something else goes wrong", () => {
    it("says so when their page cannot be fetched, and still offers both choices", async () => {
      failTheirs = "SERVICE_UNAVAILABLE"

      setup()
      await provoke()

      expect(await screen.findByText("That did not work")).toBeInTheDocument()

      // Still answerable. Keeping mine needs nothing from their document, and
      // a prompt that only shows an error is a dead end.
      expect(screen.getByRole("button", { name: "Keep mine" })).toBeInTheDocument()
    })

    it("says so when their page cannot be read, rather than comparing against nothing", async () => {
      unreadableTheirs = true

      setup()
      await provoke()

      expect(
        await screen.findByText(/could not be read. Keeping yours is still safe./),
      ).toBeInTheDocument()
    })

    it("keeps the prompt open when resolving fails", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      setup()
      await provoke()
      await screen.findByRole("button", { name: "Keep mine" })

      failResolve = true
      await user.click(screen.getByRole("button", { name: "Keep mine" }))

      expect(await screen.findByText("That did not work")).toBeInTheDocument()

      // Nothing was decided, so nothing may be dismissed on the user's behalf.
      expect(screen.getByRole("button", { name: "Keep mine" })).toBeInTheDocument()
      expect(store.getState().persistence.status).toBe("error")
    })
  })

  describe("comparing", () => {
    it("names the elements both sides touched, on request", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      setup()
      await provoke()
      await screen.findByRole("button", { name: "Compare" })

      await user.click(screen.getByRole("button", { name: "Compare" }))

      expect(screen.getByText("Elements involved")).toBeInTheDocument()
      // Honest about what it cannot show yet rather than pretending.
      expect(screen.getByText(/arrives with the component library/)).toBeInTheDocument()
    })
  })
})
