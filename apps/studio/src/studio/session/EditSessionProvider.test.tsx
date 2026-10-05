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
import { TakeoverPrompt } from "./TakeoverPrompt"

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

      return (
        <>
          <EditorStatus />
          <TakeoverPrompt />
        </>
      )
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

  /**
   * Click a button in the arrival prompt, once the prompt can actually be
   * clicked.
   *
   * Radix locks pointer events on the body while a dialog settles and gives the
   * dialog's own content `pointer-events: auto` in an effect. userEvent refuses
   * to click through the lock, correctly — so between the button appearing and
   * the content becoming interactive there is a window, and under load it is
   * wide enough to land in. That was this suite's CI failure: "Unable to
   * perform pointer interaction as the element has `pointer-events: none`".
   *
   * Waited for rather than switched off, because "can the user click this?" is
   * worth keeping as a real check.
   */
  async function clickInPrompt(
    user: ReturnType<typeof userEvent.setup>,
    name: string,
  ): Promise<void> {
    const button = await screen.findByRole("button", { name })

    await waitFor(() => {
      expect(window.getComputedStyle(screen.getByRole("dialog")).pointerEvents).toBe("auto")
    })

    await user.click(button)
  }

  /**
   * Advance the clock a heartbeat at a time, until the condition holds.
   *
   * The poll interval is created in an effect that waits for the claim to
   * resolve, so a single advance can land before the interval exists and be
   * missed altogether — and `waitFor` cannot move a fake clock, it only waits
   * on real time. Stepping and checking between steps is what makes this
   * deterministic rather than a race the fast machine happens to win.
   */
  async function afterHeartbeats(check: () => void, beats = 5): Promise<void> {
    for (let beat = 0; beat < beats; beat += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SESSION_HEARTBEAT_SECONDS * 1_000)
      })

      try {
        check()

        return
      } catch {
        // Another beat. The last one rethrows.
      }
    }

    check()
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

      await afterHeartbeats(() => {
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

      await afterHeartbeats(() => {
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

      /*
       * The flush is the last chance to persist while the write is still
       * allowed. There is no channel that could have told this session sooner,
       * so learning on the heartbeat and flushing then is the ordering that is
       * actually available — see docs/history-versioning.md § Takeover.
       */
      await afterHeartbeats(() => {
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

      // Several beats, all of them failing. A failed request is not evidence
      // of having lost the page, and treating it as such makes a flaky network
      // read-only.
      await afterHeartbeats(() => {
        expect(callsTo("PUT /api/pages/pag_test/session").length).toBeGreaterThan(0)
      })

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

  describe("the prompt on arrival", () => {
    beforeEach(() => {
      reply("POST /api/pages/pag_test/session", {
        data: {
          held: false,
          holder: { clientLabel: "Chrome on macOS", lastHeartbeatAt: "2026-10-05T00:00:00.000Z" },
          draftVersion: 1,
        },
      })
    })

    it("asks, rather than leaving a badge to be noticed", async () => {
      setup()

      // Never silently blocked and never silently allowed. A status bar badge
      // alone is the silent version of both.
      expect(await screen.findByText("This page is open in another session")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Open read-only" })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Take over editing" })).toBeInTheDocument()
    })

    it("names where the page is open, so somebody recognises their own tab", async () => {
      setup()

      expect(await screen.findByText(/Editing in Chrome on macOS/)).toBeInTheDocument()
    })

    it("takes the page when asked, from the prompt", async () => {
      const user = userEvent.setup()

      setup()
      await clickInPrompt(user, "Take over editing")

      await waitFor(() => {
        expect(store.getState().persistence.canEdit).toBe(true)
      })

      expect(callsTo("POST /api/pages/pag_test/session/takeover")).toHaveLength(1)
    })

    it("leaves the page alone when read-only is chosen", async () => {
      const user = userEvent.setup()

      setup()
      await clickInPrompt(user, "Open read-only")

      await waitFor(() => {
        expect(screen.queryByText("This page is open in another session")).toBeNull()
      })

      expect(callsTo("POST /api/pages/pag_test/session/takeover")).toEqual([])
      expect(store.getState().persistence.canEdit).toBe(false)
      // The badge is what carries the state from here, with the offer still on it.
      expect(screen.getByRole("button", { name: "Take over" })).toBeInTheDocument()
    })

    it("does not ask again once it has been answered", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      setup()
      await clickInPrompt(user, "Open read-only")

      /*
       * Waited for, not asserted.
       *
       * The dialog animates out, so it is still in the document for a frame or
       * two after the click. Reading it immediately passed on a fast machine
       * and failed on CI, which is the whole class of test this was.
       */
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull()
      })

      reply("GET /api/pages/pag_test/session", {
        data: {
          session: { clientLabel: "Chrome on macOS", lastHeartbeatAt: "2026-10-05T00:00:00.000Z" },
        },
      })

      // Read-only is a state the person chose. A prompt that returned every
      // time the other session heartbeated would be unusable.
      await afterHeartbeats(() => {
        expect(callsTo("GET /api/pages/pag_test/session").length).toBeGreaterThan(0)
      })

      expect(screen.queryByRole("dialog")).toBeNull()
      expect(screen.getByRole("button", { name: "Take over" })).toBeInTheDocument()
    })

    it("does not ask at all when the page is free", async () => {
      reply("POST /api/pages/pag_test/session", { data: { held: true, draftVersion: 1 } })

      setup()

      await waitFor(() => {
        expect(store.getState().persistence.canEdit).toBe(true)
      })

      expect(screen.queryByText("This page is open in another session")).toBeNull()
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

      // The prompt is answered first. Until it is, the rest of the editor is
      // behind it and out of the accessibility tree — which is the point of a
      // modal, and is also the real order of events.
      await clickInPrompt(user, "Open read-only")

      await user.click(await screen.findByRole("button", { name: "Take over" }))

      await waitFor(() => {
        expect(callsTo("POST /api/pages/pag_test/session/takeover")).toHaveLength(1)
      })

      expect(store.getState().persistence.canEdit).toBe(true)
      expect(screen.queryByRole("button", { name: "Take over" })).toBeNull()
    })

    it("offers to start editing once the other session ends, rather than taking it", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })

      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

      setup()

      await clickInPrompt(user, "Open read-only")
      await screen.findByRole("button", { name: "Take over" })

      reply("GET /api/pages/pag_test/session", { data: { session: null } })

      await afterHeartbeats(() => {
        expect(screen.getByRole("button", { name: "Start editing" })).toBeInTheDocument()
      })

      // Offered, not taken: somebody reading a page should not start holding
      // its lock because the other tab closed.
      expect(store.getState().persistence.canEdit).toBe(false)
    })
  })
})
