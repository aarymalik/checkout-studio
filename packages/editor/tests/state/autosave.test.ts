import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { serialize } from "@checkout-studio/schema"

import {
  DEBOUNCE_MS,
  MAXIMUM_WAIT_MS,
  createAutosave,
  type SaveOutcome,
  type SaveRequest,
} from "../../src/state/autosave"
import { createMemoryQueue, type SaveQueue } from "../../src/state/queue"
import { makeStore } from "./support"

/**
 * Autosave.
 *
 * The rules are exact and each exists for a reason: the debounce keeps a burst
 * of edits from becoming a burst of requests, the ceiling keeps somebody who
 * never pauses from going half an hour without a save, and the queue keeps a
 * failure from being a loss.
 */

interface Harness {
  store: ReturnType<typeof makeStore>["store"]
  autosave: ReturnType<typeof createAutosave>
  requests: SaveRequest[]
  queue: SaveQueue
  stop: () => void
  /** What the next save will answer. */
  respond: (outcome: SaveOutcome | ((request: SaveRequest) => SaveOutcome)) => void
}

function harness(options: { queue?: SaveQueue } = {}): Harness {
  const { store } = makeStore()
  const requests: SaveRequest[] = []
  const queue = options.queue ?? createMemoryQueue()
  let version = 1
  let responder: (request: SaveRequest) => SaveOutcome = () => ({
    ok: true,
    version: (version += 1),
  })

  const autosave = createAutosave({
    store,
    pageId: "pag_test",
    queue,
    save: async (request) => {
      requests.push(request)

      return responder(request)
    },
  })

  const stop = autosave.start()

  return {
    store,
    autosave,
    requests,
    queue,
    stop,
    respond: (outcome) => {
      responder = typeof outcome === "function" ? outcome : () => outcome
    },
  }
}

/** Lets the promises inside a save settle. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0)
}

describe("autosave", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("fires five seconds after the last change", async () => {
    const { store, requests, stop } = harness()

    store.getState().setProps("heading", { text: "Hello" })

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 1)
    expect(requests).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1)
    expect(requests).toHaveLength(1)

    stop()
  })

  // A burst of edits is one save, not one per keystroke.
  it("restarts the wait on every change", async () => {
    const { store, requests, stop } = harness()

    for (let index = 0; index < 5; index += 1) {
      store.getState().setProps("heading", { text: `v${index}` })
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 500)
    }

    expect(requests).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

    expect(requests).toHaveLength(1)

    stop()
  })

  /*
   * Somebody who never pauses would otherwise never be saved. The ceiling is
   * set once per unsaved run rather than per keystroke — set per keystroke it
   * is pushed out forever and never fires.
   */
  it("fires at most thirty seconds apart during continuous editing", async () => {
    const { store, requests, stop } = harness()

    for (let elapsed = 0; elapsed < MAXIMUM_WAIT_MS; elapsed += 1_000) {
      store.getState().setProps("heading", { text: `v${elapsed}` })
      await vi.advanceTimersByTimeAsync(1_000)
    }

    expect(requests).toHaveLength(1)

    stop()
  })

  it("does not fire when nothing changed", async () => {
    const { requests, stop } = harness()

    await vi.advanceTimersByTimeAsync(MAXIMUM_WAIT_MS * 2)

    expect(requests).toHaveLength(0)

    stop()
  })

  // Every one of these changes the store, and none of them is the page.
  it.each([
    ["selection", (store: Harness["store"]) => store.getState().select(["heading"])],
    ["zoom", (store: Harness["store"]) => store.getState().setZoom(2)],
    ["breakpoint", (store: Harness["store"]) => store.getState().setBreakpoint("mobile")],
    ["panning", (store: Harness["store"]) => store.getState().setPan({ x: 5, y: 5 })],
    ["rulers", (store: Harness["store"]) => store.getState().toggleViewportFlag("showRulers")],
    ["drag", (store: Harness["store"]) => store.getState().beginDrag(["heading"])],
    [
      "the inspector's state",
      (store: Harness["store"]) => store.getState().setEditingState("hover"),
    ],
    ["copying", (store: Harness["store"]) => store.getState().copy()],
  ])("does not fire on %s", async (_name, act) => {
    const { store, requests, stop } = harness()

    store.getState().select(["heading"])
    act(store)

    await vi.advanceTimersByTimeAsync(MAXIMUM_WAIT_MS * 2)

    expect(requests).toHaveLength(0)

    stop()
  })

  it("does not fire when an edit is undone back to where it started", async () => {
    const { store, requests, stop } = harness()

    store.getState().setProps("heading", { text: "Hello" })
    store.getState().undo()

    await vi.advanceTimersByTimeAsync(MAXIMUM_WAIT_MS * 2)

    expect(requests).toHaveLength(0)

    stop()
  })

  it("sends the document and the version it was written against", async () => {
    const { store, requests, stop } = harness()

    store.getState().markSaved(7)
    store.getState().setProps("heading", { text: "Hello" })

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

    expect(requests[0]).toMatchObject({ pageId: "pag_test", baseVersion: 7 })
    expect(requests[0]?.document.nodes["heading"]?.props["text"]).toBe("Hello")

    stop()
  })

  it("records the new version and goes clean", async () => {
    const { store, stop } = harness()

    store.getState().setProps("heading", { text: "Hello" })

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    await settle()

    expect(store.getState().persistence).toMatchObject({ status: "saved", baseVersion: 2 })

    stop()
  })

  // A session that has lost its lock never writes: its version is stale and the
  // server would reject it, and repeated failures tell the user nothing.
  it("does not write when the session cannot edit", async () => {
    const { store, requests, stop } = harness()

    store.getState().setCanEdit(false)
    store.getState().setProps("heading", { text: "Hello" })

    await vi.advanceTimersByTimeAsync(MAXIMUM_WAIT_MS * 2)

    expect(requests).toHaveLength(0)

    stop()
  })

  describe("flush", () => {
    it("saves immediately rather than waiting", async () => {
      const { store, autosave, requests, stop } = harness()

      store.getState().setProps("heading", { text: "Hello" })
      await autosave.flush()

      expect(requests).toHaveLength(1)

      stop()
    })

    it("does nothing when there is nothing to save", async () => {
      const { autosave, requests, stop } = harness()

      await autosave.flush()

      expect(requests).toHaveLength(0)

      stop()
    })

    // Otherwise two writes of the same document go out against the same
    // version, and the second is rejected as a conflict with itself.
    it("does not start a second write while one is in flight", async () => {
      const { store } = makeStore()
      let release: (outcome: SaveOutcome) => void = () => undefined
      let calls = 0
      const autosave = createAutosave({
        store,
        pageId: "pag_test",
        queue: createMemoryQueue(),
        save: () => {
          calls += 1

          return new Promise<SaveOutcome>((resolve) => {
            release = resolve
          })
        },
      })
      const stop = autosave.start()

      store.getState().setProps("heading", { text: "Hello" })

      const first = autosave.flush()
      const second = autosave.flush()

      expect(calls).toBe(1)

      release({ ok: true, version: 2 })
      await Promise.all([first, second])

      expect(calls).toBe(1)

      stop()
    })

    it("does not write twice when a debounce was already pending", async () => {
      const { store, autosave, requests, stop } = harness()

      store.getState().setProps("heading", { text: "Hello" })
      await autosave.flush()
      await vi.advanceTimersByTimeAsync(MAXIMUM_WAIT_MS * 2)

      expect(requests).toHaveLength(1)

      stop()
    })
  })

  describe("failure", () => {
    it("queues what it could not send", async () => {
      const test = harness()
      test.respond({ ok: false, conflict: false, message: "Offline." })
      test.store.getState().setProps("heading", { text: "Hello" })

      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
      await settle()

      expect(await test.queue.all("pag_test")).toHaveLength(1)
      expect(test.store.getState().persistence).toMatchObject({
        status: "error",
        error: "Offline.",
      })

      test.stop()
    })

    it("retries with a growing delay", async () => {
      const test = harness()
      test.respond({ ok: false, conflict: false, message: "Offline." })
      test.store.getState().setProps("heading", { text: "Hello" })

      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
      await settle()
      expect(test.requests).toHaveLength(1)

      // First retry after a second.
      await vi.advanceTimersByTimeAsync(1_000)
      await settle()
      expect(test.requests).toHaveLength(2)

      // Second after two, not one.
      await vi.advanceTimersByTimeAsync(1_000)
      await settle()
      expect(test.requests).toHaveLength(2)

      await vi.advanceTimersByTimeAsync(1_000)
      await settle()
      expect(test.requests).toHaveLength(3)

      test.stop()
    })

    it("recovers when the server comes back", async () => {
      const test = harness()
      test.respond({ ok: false, conflict: false, message: "Offline." })
      test.store.getState().setProps("heading", { text: "Hello" })

      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
      await settle()

      test.respond({ ok: true, version: 9 })
      await vi.advanceTimersByTimeAsync(1_000)
      await settle()

      expect(test.store.getState().persistence).toMatchObject({ status: "saved", baseVersion: 9 })
      expect(await test.queue.all("pag_test")).toEqual([])

      test.stop()
    })

    // Retrying a stale write fails identically until somebody chooses which
    // version survives.
    it("does not retry a conflict", async () => {
      const test = harness()

      test.respond({ ok: false, conflict: true, message: "Changed elsewhere." })
      test.store.getState().setProps("heading", { text: "Hello" })

      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
      await settle()
      await vi.advanceTimersByTimeAsync(60_000)
      await settle()

      expect(test.requests).toHaveLength(1)
      expect(test.store.getState().persistence.status).toBe("error")
      expect(await test.queue.all("pag_test")).toEqual([])

      test.stop()
    })

    it("tells the caller about a conflict", async () => {
      const { store } = makeStore()
      const onConflict = vi.fn()
      const autosave = createAutosave({
        store,
        pageId: "pag_test",
        queue: createMemoryQueue(),
        onConflict,
        save: async () => ({ ok: false, conflict: true, message: "Changed elsewhere." }),
      })
      const stop = autosave.start()

      store.getState().setProps("heading", { text: "Hello" })
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
      await settle()

      expect(onConflict).toHaveBeenCalledWith("Changed elsewhere.")

      stop()
    })
  })

  describe("replay", () => {
    it("sends what a previous session left, oldest first", async () => {
      const queue = createMemoryQueue()
      const { store } = makeStore()

      await queue.add({
        pageId: "pag_test",
        document: serialize(store.getState().document),
        baseVersion: 1,
        queuedAt: 10,
      })
      await queue.add({
        pageId: "pag_test",
        document: serialize(store.getState().document),
        baseVersion: 2,
        queuedAt: 20,
      })

      const test = harness({ queue })
      await test.autosave.replay()

      expect(test.requests.map((request) => request.baseVersion)).toEqual([1, 2])
      expect(await queue.all("pag_test")).toEqual([])

      test.stop()
    })

    /*
     * Each entry carries the version it was written against, so an entry the
     * server has already applied comes back as a conflict — which means there
     * is nothing to send, not that something went wrong.
     */
    it("drops an entry the server has already applied", async () => {
      const queue = createMemoryQueue()
      const { store } = makeStore()

      await queue.add({
        pageId: "pag_test",
        document: serialize(store.getState().document),
        baseVersion: 1,
        queuedAt: 10,
      })

      const test = harness({ queue })
      test.respond({ ok: false, conflict: true, message: "Already applied." })
      await test.autosave.replay()

      expect(await queue.all("pag_test")).toEqual([])

      test.stop()
    })

    it("stops and keeps the rest when the network is still down", async () => {
      const queue = createMemoryQueue()
      const { store } = makeStore()

      for (const version of [1, 2, 3]) {
        await queue.add({
          pageId: "pag_test",
          document: serialize(store.getState().document),
          baseVersion: version,
          queuedAt: version,
        })
      }

      const test = harness({ queue })
      test.respond({ ok: false, conflict: false, message: "Still offline." })
      await test.autosave.replay()

      expect(test.requests).toHaveLength(1)
      expect(await queue.all("pag_test")).toHaveLength(3)

      test.stop()
    })

    it("does nothing with an empty queue", async () => {
      const test = harness()

      await test.autosave.replay()

      expect(test.requests).toEqual([])

      test.stop()
    })

    it("ignores entries belonging to another page", async () => {
      const queue = createMemoryQueue()
      const { store } = makeStore()

      await queue.add({
        pageId: "pag_other",
        document: serialize(store.getState().document),
        baseVersion: 1,
        queuedAt: 10,
      })

      const test = harness({ queue })
      await test.autosave.replay()

      expect(test.requests).toEqual([])

      test.stop()
    })
  })

  describe("stopping", () => {
    it("cancels a pending save", async () => {
      const { store, requests, stop } = harness()

      store.getState().setProps("heading", { text: "Hello" })
      stop()

      await vi.advanceTimersByTimeAsync(MAXIMUM_WAIT_MS * 2)

      expect(requests).toEqual([])
    })
  })

  describe("isSaving", () => {
    // Held open deliberately: advancing fake timers also drains microtasks, so
    // a save that resolves at once is already finished by the time anything
    // could observe it.
    it("reports whether a write is in flight", async () => {
      const { store } = makeStore()
      let release: (outcome: SaveOutcome) => void = () => undefined
      const autosave = createAutosave({
        store,
        pageId: "pag_test",
        queue: createMemoryQueue(),
        save: () =>
          new Promise<SaveOutcome>((resolve) => {
            release = resolve
          }),
      })
      const stop = autosave.start()

      expect(autosave.isSaving()).toBe(false)

      store.getState().setProps("heading", { text: "Hello" })
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)

      expect(autosave.isSaving()).toBe(true)
      expect(store.getState().persistence.status).toBe("saving")

      release({ ok: true, version: 4 })
      await settle()

      expect(autosave.isSaving()).toBe(false)
      expect(store.getState().persistence.status).toBe("saved")

      stop()
    })
  })
})
