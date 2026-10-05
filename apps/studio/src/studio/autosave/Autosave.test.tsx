import { act, render } from "@testing-library/react"
import {
  DEBOUNCE_MS,
  EditorProvider,
  MAXIMUM_WAIT_MS,
  useEditorStoreApi,
  type EditorStoreApi,
} from "@checkout-studio/editor"
import { createDocument, type CheckoutSchema } from "@checkout-studio/schema"
import { logger } from "@checkout-studio/observability"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactElement } from "react"

import { Autosave } from "./Autosave"

/**
 * Autosave, mounted.
 *
 * The engine is tested in packages/editor and the transport beside this file.
 * What only a mounted component can answer is whether they are connected at
 * all — which is the thing that was missing: `createAutosave` existed, was
 * tested, and nothing called it, so every edit in the editor was lost on
 * reload.
 *
 * So these tests assert the wiring rather than the rules: an edit reaches the
 * API, a non-edit does not, and closing the page does not wait out the
 * debounce.
 */

interface Call {
  url: string
  method: string
  body: { baseVersion: number; patch: readonly unknown[] }
}

function blank(): CheckoutSchema {
  return createDocument({
    projectId: "prj_test",
    pageId: "pag_test",
    themeId: "theme_default",
    random: () => 0.5,
  })
}

describe("Autosave", () => {
  let calls: Call[]
  let draftVersion: number

  function setup(document: CheckoutSchema = blank()): {
    store: EditorStoreApi
    unmount: () => void
  } {
    let captured: EditorStoreApi | null = null

    function Capture(): ReactElement {
      captured = useEditorStoreApi()

      return <Autosave document={document} />
    }

    const { unmount } = render(
      <EditorProvider document={document} baseVersion={1}>
        <Capture />
      </EditorProvider>,
    )

    if (captured === null) throw new Error("The provider did not render.")

    return { store: captured, unmount }
  }

  /** Let the promises inside the engine resolve, with the clock held still. */
  async function settle(): Promise<void> {
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  beforeEach(() => {
    vi.useFakeTimers()
    calls = []
    draftVersion = 1

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
        calls.push({
          url,
          method: init?.method ?? "GET",
          body: JSON.parse(init?.body ?? "{}") as Call["body"],
        })

        draftVersion += 1

        return new Response(
          JSON.stringify({ success: true, data: { draftVersion }, error: null, meta: {} }),
          { headers: { "content-type": "application/json" } },
        )
      }),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("renders nothing", () => {
    const { container } = render(
      <EditorProvider document={blank()} baseVersion={1}>
        <Autosave document={blank()} />
      </EditorProvider>,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it("sends an edit to the API after the debounce", async () => {
    const { store } = setup()

    act(() => {
      store.getState().rename(store.getState().document.root, "Checkout")
    })

    expect(calls).toEqual([])

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    })
    await settle()

    expect(calls).toHaveLength(1)
    expect(calls[0]?.method).toBe("PATCH")
    expect(calls[0]?.url).toBe("/api/pages/pag_test/draft")
    expect(calls[0]?.body.patch).toHaveLength(1)
  })

  it("marks the page saved with the version the server gave back", async () => {
    const { store } = setup()

    act(() => {
      store.getState().rename(store.getState().document.root, "Checkout")
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    })
    await settle()

    // The next write has to be made against this, or it conflicts with itself.
    expect(store.getState().persistence.status).toBe("saved")
    expect(store.getState().persistence.baseVersion).toBe(2)
  })

  it("does not write when nothing about the page changed", async () => {
    const { store } = setup()

    act(() => {
      store.getState().select([store.getState().document.root])
      store.getState().setZoom(2)
      store.getState().setBreakpoint("mobile")
      store.getState().toggleViewportFlag("showGrid")
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MAXIMUM_WAIT_MS * 2)
    })
    await settle()

    // Selection, zoom and panel state all change the store and none of them
    // are the page — docs/history-versioning.md § Autosave Rules.
    expect(calls).toEqual([])
  })

  it("saves without waiting out the debounce when the page is closing", async () => {
    const { store } = setup()

    act(() => {
      store.getState().rename(store.getState().document.root, "Checkout")
    })

    await act(async () => {
      window.dispatchEvent(new Event("pagehide"))
    })
    await settle()

    // Closing a tab is the ordinary way an edit is lost, and five seconds is
    // long enough to lose it in.
    expect(calls).toHaveLength(1)
  })

  it("saves when the tab is hidden, which on mobile is the last callback there is", async () => {
    const { store } = setup()

    act(() => {
      store.getState().rename(store.getState().document.root, "Checkout")
    })

    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden" as const)

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"))
    })
    await settle()

    expect(calls).toHaveLength(1)

    visibility.mockRestore()
  })

  it("does not save when the tab merely becomes visible again", async () => {
    const { store } = setup()

    act(() => {
      store.getState().rename(store.getState().document.root, "Checkout")
    })

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"))
    })
    await settle()

    // jsdom reports "visible", which is the case this guards: a flush on every
    // visibility change would write on the way back in too.
    expect(calls).toEqual([])
  })

  it("stops writing once it is unmounted", async () => {
    const { store, unmount } = setup()

    act(() => {
      store.getState().rename(store.getState().document.root, "Checkout")
    })

    // Unmounted inside the debounce, so the pending write is the one being
    // cancelled rather than one that already went out.
    unmount()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MAXIMUM_WAIT_MS * 2)
    })
    await settle()

    // A timer that outlives the page writes somebody's old document over their
    // new one when they open the next page.
    expect(calls).toEqual([])
  })

  it("stops listening for the page closing once it is unmounted", async () => {
    const { store, unmount } = setup()

    act(() => {
      store.getState().rename(store.getState().document.root, "Checkout")
    })

    unmount()

    await act(async () => {
      window.dispatchEvent(new Event("pagehide"))
    })
    await settle()

    expect(calls).toEqual([])
  })
})

describe("Autosave when a write cannot be made", () => {
  let warn: ReturnType<typeof vi.spyOn>

  function setup(): { store: EditorStoreApi; unmount: () => void } {
    const document = blank()
    let captured: EditorStoreApi | null = null

    function Capture(): ReactElement {
      captured = useEditorStoreApi()

      return <Autosave document={document} />
    }

    const { unmount } = render(
      <EditorProvider document={document} baseVersion={1}>
        <Capture />
      </EditorProvider>,
    )

    if (captured === null) throw new Error("The provider did not render.")

    return { store: captured, unmount }
  }

  async function settle(): Promise<void> {
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  function reply(code: string, message: string): void {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ success: false, data: null, error: { code, message }, meta: {} }),
            { headers: { "content-type": "application/json" } },
          ),
      ),
    )
  }

  beforeEach(() => {
    vi.useFakeTimers()
    warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    warn.mockRestore()
  })

  it("reports a conflict and stops, rather than overwriting either side", async () => {
    reply("DRAFT_CONFLICT", "This page was changed in another session.")

    const { store } = setup()

    act(() => {
      store.getState().rename(store.getState().document.root, "Checkout")
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    })
    await settle()

    expect(store.getState().persistence.status).toBe("error")
    expect(store.getState().persistence.error).toBe("This page was changed in another session.")
    expect(warn).toHaveBeenCalledWith(
      "autosave.conflict",
      expect.objectContaining({ pageId: "pag_test" }),
    )

    // The prompt that lets somebody choose is still to come. What must not
    // happen in the meantime is another write.
    const before = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MAXIMUM_WAIT_MS * 4)
    })
    await settle()

    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(before)
  })

  it("keeps a failed write to try again, and says it is not saved", async () => {
    reply("SERVICE_UNAVAILABLE", "The server is restarting.")

    const { store } = setup()

    act(() => {
      store.getState().rename(store.getState().document.root, "Checkout")
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    })
    await settle()

    expect(store.getState().persistence.status).toBe("error")

    // Retried with backoff rather than dropped.
    const first = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    await settle()

    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(first)
  })

  it("survives a flush that cannot complete", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch")
      }),
    )

    const { store } = setup()

    act(() => {
      store.getState().rename(store.getState().document.root, "Checkout")
    })

    // An unhandled rejection here would surface as a page error on the way out,
    // which is the worst possible moment for one.
    await act(async () => {
      window.dispatchEvent(new Event("pagehide"))
    })
    await settle()

    expect(store.getState().persistence.status).toBe("error")
  })
})
