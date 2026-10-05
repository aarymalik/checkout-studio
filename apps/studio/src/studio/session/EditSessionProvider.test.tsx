import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { StrictMode } from "react"
import userEvent from "@testing-library/user-event"
import { EditorProvider, useEditorStoreApi, type EditorStoreApi } from "@checkout-studio/editor"
import { SESSION_HEARTBEAT_SECONDS } from "@checkout-studio/types"
import { createDocument } from "@checkout-studio/schema"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactElement } from "react"

import { Autosave } from "@/studio/autosave/Autosave"

import { EditSessionProvider } from "./EditSessionProvider"
import { EditorStatus } from "./EditorStatus"

/**
 * The edit session.
 *
 * One writer per page. What is tested here is the part that decides whether
 * somebody may type: the claim on open, the heartbeat that is how a session
 * learns it has been taken, and the rule that every failure fails open.
 *
 * That last one is the important one. The lock is an ergonomic guard, not a
 * correctness guarantee — correctness is the version on every write — so being
 * locked out of your own page because Redis blinked is strictly worse than two
 * sessions racing, which is already handled.
 */

interface Call {
  url: string
  method: string
  body: unknown
}

type Reply = { status?: number; ok?: boolean; code?: string; data?: unknown }

describe("EditSessionProvider", () => {
  let calls: Call[]
  let replies: Map<string, Reply>
  let store: EditorStoreApi

  function setup({ strict = false }: { strict?: boolean } = {}): { unmount: () => void } {
    const document = createDocument({
      projectId: "prj_test",
      pageId: "pag_test",
      themeId: "theme_default",
    })

    function Capture(): ReactElement {
      store = useEditorStoreApi()

      return <EditorStatus />
    }

    const tree = (
      <EditorProvider document={document} baseVersion={1}>
        <Autosave document={document}>
          <EditSessionProvider pageId="pag_test">
            <Capture />
          </EditSessionProvider>
        </Autosave>
      </EditorProvider>
    )

    return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
  }

  /** Keys the stub by "METHOD /path", so each route can answer differently. */
  function reply(key: string, value: Reply): void {
    replies.set(key, value)
  }

  function callsTo(key: string): Call[] {
    const [method, url] = key.split(" ")

    return calls.filter((call) => call.method === method && call.url === url)
  }

  beforeEach(() => {
    calls = []
    replies = new Map()

    // Claimed by us, by default: the ordinary case of opening a page nobody
    // else has.
    reply("POST /api/pages/pag_test/session", { data: { held: true, draftVersion: 1 } })
    reply("PUT /api/pages/pag_test/session", { data: { held: true } })
    reply("GET /api/pages/pag_test/session", { data: { session: null } })
    reply("DELETE /api/pages/pag_test/session", { data: { released: true } })
    reply("POST /api/pages/pag_test/session/takeover", { data: { draftVersion: 1 } })
    reply("PATCH /api/pages/pag_test/draft", { data: { draftVersion: 2 } })

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
        const method = init?.method ?? "GET"

        calls.push({
          url,
          method,
          body: init?.body === undefined ? undefined : JSON.parse(init.body),
        })

        const answer = replies.get(`${method} ${url}`) ?? { data: {} }
        const envelope =
          answer.ok === false
            ? {
                success: false,
                data: null,
                error: { code: answer.code ?? "INTERNAL_ERROR", message: "No." },
                meta: {},
              }
            : { success: true, data: answer.data ?? {}, error: null, meta: {} }

        return new Response(JSON.stringify(envelope), {
          status: answer.status ?? (answer.ok === false ? 500 : 200),
          headers: { "content-type": "application/json" },
        })
      }),
    )
  })

  afterEach(async () => {
    /*
     * Unmounted before the stub is taken away.
     *
     * The global cleanup runs after this hook, so unmounting there fired the
     * release against the real fetch — which cannot parse a relative URL and
     * logged a handled error after every test. Noise like that is what hides a
     * warning that matters.
     */
    cleanup()

    await act(async () => {
      await Promise.resolve()
    })

    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  describe("claiming", () => {
    it("claims the page when the editor opens", async () => {
      setup()

      await waitFor(() => {
        expect(callsTo("POST /api/pages/pag_test/session")).toHaveLength(1)
      })

      expect(callsTo("POST /api/pages/pag_test/session")[0]?.body).toMatchObject({
        sessionId: expect.stringMatching(/.{8,64}/),
        clientLabel: expect.any(String),
      })

      expect(store.getState().persistence.canEdit).toBe(true)
    })

    it("opens read-only when somebody else has it, and says who", async () => {
      reply("POST /api/pages/pag_test/session", {
        data: {
          held: false,
          holder: { clientLabel: "Chrome on macOS", lastHeartbeatAt: "2026-10-05T00:00:00.000Z" },
          draftVersion: 1,
        },
      })

      setup()

      await waitFor(() => {
        expect(screen.getByText(/editing in Chrome on macOS/)).toBeInTheDocument()
      })

      // The store is what stops a write going out and what greys the panels.
      expect(store.getState().persistence.canEdit).toBe(false)
    })

    /*
     * The bug this exists for.
     *
     * React calls an effect, cleans it up and calls it again on mount in
     * development, and the application runs with that on. The claim and the
     * release were in flight together and unordered, so the release landed
     * after the second claim: this session believed it held a page that was
     * locked by nobody, and the second tab then claimed it freely — the
     * opposite of the whole feature.
     *
     * Four plain-render tests passed throughout, because a plain render calls
     * each effect once.
     */
    it("still holds the page after the double mount React does in development", async () => {
      setup({ strict: true })

      await waitFor(() => {
        expect(store.getState().persistence.canEdit).toBe(true)
      })

      // Settle anything the second invocation queued.
      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(callsTo("DELETE /api/pages/pag_test/session")).toEqual([])
      expect(store.getState().persistence.canEdit).toBe(true)
    })

    it("claims and releases in order, never overlapping", async () => {
      const { unmount } = setup({ strict: true })

      await waitFor(() => {
        expect(store.getState().persistence.canEdit).toBe(true)
      })

      unmount()

      await waitFor(() => {
        expect(callsTo("DELETE /api/pages/pag_test/session")).toHaveLength(1)
      })

      // The release is last. Out of order it would have freed a page that the
      // remount had just taken.
      const lock = calls.filter((call) => call.url.endsWith("/session"))

      expect(lock[lock.length - 1]?.method).toBe("DELETE")
    })

    it("lets editing proceed when the claim itself fails", async () => {
      reply("POST /api/pages/pag_test/session", { ok: false, code: "SERVICE_UNAVAILABLE" })

      setup()

      await waitFor(() => {
        expect(callsTo("POST /api/pages/pag_test/session")).toHaveLength(1)
      })

      /*
       * Fails open, deliberately.
       *
       * This request is not the thing that keeps two writers apart — the
       * version check on every write is. Locking somebody out of their own page
       * because the lock service is down would be a worse outcome than the
       * clash it is avoiding, and the clash is already handled.
       */
      expect(store.getState().persistence.canEdit).toBe(true)
      expect(screen.queryByText(/Read only/)).toBeNull()
    })
  })

  describe("holding", () => {
    it("refreshes the lock on a heartbeat", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })

      setup()

      await waitFor(() => {
        expect(store.getState().persistence.canEdit).toBe(true)
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(SESSION_HEARTBEAT_SECONDS * 1_000)
      })

      await waitFor(() => {
        expect(callsTo("PUT /api/pages/pag_test/session")).toHaveLength(1)
      })
    })

    it("goes read-only when the heartbeat says the page was taken", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })

      setup()

      await waitFor(() => {
        expect(store.getState().persistence.canEdit).toBe(true)
      })

      reply("PUT /api/pages/pag_test/session", { data: { held: false } })
      reply("GET /api/pages/pag_test/session", {
        data: {
          session: { clientLabel: "Safari on iPhone", lastHeartbeatAt: "2026-10-05T00:00:00.000Z" },
        },
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(SESSION_HEARTBEAT_SECONDS * 1_000)
      })

      await waitFor(() => {
        expect(store.getState().persistence.canEdit).toBe(false)
      })

      expect(await screen.findByText(/editing in Safari on iPhone/)).toBeInTheDocument()
    })

    it("saves what it has before giving up the right to write", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })

      setup()

      await waitFor(() => {
        expect(store.getState().persistence.canEdit).toBe(true)
      })

      act(() => {
        store.getState().rename(store.getState().document.root, "Checkout")
      })

      reply("PUT /api/pages/pag_test/session", { data: { held: false } })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(SESSION_HEARTBEAT_SECONDS * 1_000)
      })

      /*
       * The flush is the last chance to persist while the write is still
       * allowed. There is no channel that could have told this session sooner,
       * so learning on the heartbeat and flushing then is the ordering that is
       * actually available — see docs/history-versioning.md § Takeover.
       */
      await waitFor(() => {
        expect(callsTo("PATCH /api/pages/pag_test/draft")).toHaveLength(1)
      })

      expect(store.getState().persistence.canEdit).toBe(false)
    })

    it("does not go read-only because one heartbeat failed", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })

      setup()

      await waitFor(() => {
        expect(store.getState().persistence.canEdit).toBe(true)
      })

      reply("PUT /api/pages/pag_test/session", { ok: false, code: "TIMEOUT" })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(SESSION_HEARTBEAT_SECONDS * 1_000)
      })

      // A failed request is not evidence of having lost the page, and treating
      // it as such makes a flaky network read-only.
      expect(store.getState().persistence.canEdit).toBe(true)
    })

    it("gives the page back when the editor goes away", async () => {
      const { unmount } = setup()

      await waitFor(() => {
        expect(store.getState().persistence.canEdit).toBe(true)
      })

      unmount()

      await waitFor(() => {
        expect(callsTo("DELETE /api/pages/pag_test/session")).toHaveLength(1)
      })

      // The holder's own id, or a stale client would unlock a page somebody
      // else just took over.
      expect(callsTo("DELETE /api/pages/pag_test/session")[0]?.body).toMatchObject({
        sessionId: expect.any(String),
      })
    })

    it("does not release a page it never held", async () => {
      reply("POST /api/pages/pag_test/session", {
        data: {
          held: false,
          holder: { clientLabel: "Chrome on macOS", lastHeartbeatAt: "2026-10-05T00:00:00.000Z" },
          draftVersion: 1,
        },
      })

      const { unmount } = setup()

      await waitFor(() => {
        expect(store.getState().persistence.canEdit).toBe(false)
      })

      unmount()

      expect(callsTo("DELETE /api/pages/pag_test/session")).toEqual([])
    })
  })

  describe("taking over", () => {
    beforeEach(() => {
      reply("POST /api/pages/pag_test/session", {
        data: {
          held: false,
          holder: { clientLabel: "Chrome on macOS", lastHeartbeatAt: "2026-10-05T00:00:00.000Z" },
          draftVersion: 1,
        },
      })
    })

    it("takes the page, and may then write", async () => {
      const user = userEvent.setup()

      setup()

      await screen.findByRole("button", { name: "Take over" })
      await user.click(screen.getByRole("button", { name: "Take over" }))

      await waitFor(() => {
        expect(callsTo("POST /api/pages/pag_test/session/takeover")).toHaveLength(1)
      })

      expect(store.getState().persistence.canEdit).toBe(true)
      expect(screen.queryByRole("button", { name: "Take over" })).toBeNull()
    })

    it("offers to start editing once the other session ends, rather than taking it", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })

      setup()

      await screen.findByRole("button", { name: "Take over" })

      reply("GET /api/pages/pag_test/session", { data: { session: null } })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(SESSION_HEARTBEAT_SECONDS * 1_000)
      })

      // Offered, not taken: somebody reading a page should not start holding
      // its lock because the other tab closed.
      expect(await screen.findByRole("button", { name: "Start editing" })).toBeInTheDocument()
      expect(store.getState().persistence.canEdit).toBe(false)
    })
  })
})
