import { IDBFactory } from "fake-indexeddb"
import { beforeEach, describe, expect, it } from "vitest"

import {
  awaitRequest,
  createDurableQueue,
  createIndexedDbQueue,
  createMemoryQueue,
  type SaveQueue,
} from "../../src/state/queue"

/**
 * The offline save queue.
 *
 * Both implementations are held to the same contract, because the whole point
 * of the interface is that the autosave controller cannot tell them apart. The
 * durable one is exercised against a real IndexedDB implementation rather than
 * a stub: the ordering guarantee lives in how the index behaves, and a stub
 * would only prove that the stub agrees with itself.
 */

function entry(overrides: Partial<Parameters<SaveQueue["add"]>[0]> = {}) {
  return {
    pageId: "pag_test",
    document: '{"version":"1.0.0"}',
    baseVersion: 1,
    queuedAt: 100,
    ...overrides,
  }
}

function contract(name: string, create: () => SaveQueue): void {
  describe(name, () => {
    let queue: SaveQueue

    beforeEach(() => {
      queue = create()
    })

    it("starts empty", async () => {
      expect(await queue.all("pag_test")).toEqual([])
    })

    it("keeps what it is given", async () => {
      const added = await queue.add(entry())

      expect(added.id).toBeGreaterThan(0)
      expect(await queue.all("pag_test")).toEqual([{ ...entry(), id: added.id }])
    })

    // Out of order, an older document overwrites a newer one. That is the
    // failure this queue exists to prevent.
    it("returns entries oldest first", async () => {
      for (const version of [1, 2, 3, 4, 5]) {
        await queue.add(entry({ baseVersion: version, queuedAt: version }))
      }

      expect((await queue.all("pag_test")).map((item) => item.baseVersion)).toEqual([1, 2, 3, 4, 5])
    })

    it("keeps pages apart", async () => {
      await queue.add(entry({ pageId: "pag_one" }))
      await queue.add(entry({ pageId: "pag_two" }))

      expect(await queue.all("pag_one")).toHaveLength(1)
      expect(await queue.all("pag_two")).toHaveLength(1)
    })

    it("removes one entry", async () => {
      const first = await queue.add(entry({ baseVersion: 1 }))
      await queue.add(entry({ baseVersion: 2 }))

      await queue.remove(first.id)

      expect((await queue.all("pag_test")).map((item) => item.baseVersion)).toEqual([2])
    })

    it("ignores a removal of something that is not there", async () => {
      await queue.add(entry())

      await queue.remove(9_999)

      expect(await queue.all("pag_test")).toHaveLength(1)
    })

    it("clears one page and leaves the others", async () => {
      await queue.add(entry({ pageId: "pag_one" }))
      await queue.add(entry({ pageId: "pag_one" }))
      await queue.add(entry({ pageId: "pag_two" }))

      await queue.clear("pag_one")

      expect(await queue.all("pag_one")).toEqual([])
      expect(await queue.all("pag_two")).toHaveLength(1)
    })

    it("clears a page that has nothing", async () => {
      await expect(queue.clear("pag_empty")).resolves.toBeUndefined()
    })
  })
}

contract("a queue in memory", createMemoryQueue)
contract("a queue in IndexedDB", () => createIndexedDbQueue(new IDBFactory()))
contract("the best queue available", () => createDurableQueue(new IDBFactory()))
contract("the best queue available with no IndexedDB", () => createDurableQueue(undefined))

describe("when the browser refuses", () => {
  /*
   * Storage blocked in a private window is the documented case. The queue must
   * report it rather than hanging: the caller falls back to keeping the save in
   * memory, which is worse than durable and much better than refusing to edit.
   */
  it("rejects rather than hanging when the database cannot be opened", async () => {
    const factory = new IDBFactory()

    // Take the database to version 2, then ask for version 1. A downgrade is
    // refused by every implementation.
    await new Promise<void>((resolve) => {
      const request = factory.open("checkout-studio", 2)
      request.onupgradeneeded = () => request.result.createObjectStore("other")
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
    })

    const queue = createIndexedDbQueue(factory)

    await expect(queue.all("pag_test")).rejects.toThrow(/Could not open the save queue/)
  })
})

describe("awaitRequest", () => {
  /*
   * A request fails for reasons no test can arrange through the queue's own
   * API — the disk is full, the transaction was aborted, the browser reclaimed
   * storage. The translation is tested directly, because an untested error
   * translator is one that throws something unreadable on the day it runs.
   */
  function fakeRequest<T>(): IDBRequest<T> & {
    succeed: (result: T) => void
    fail: (error: DOMException | null) => void
  } {
    const request = {
      result: undefined as T,
      error: null as DOMException | null,
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
    }

    return {
      ...(request as unknown as IDBRequest<T>),
      get result() {
        return request.result
      },
      get error() {
        return request.error
      },
      set onsuccess(handler: (() => void) | null) {
        request.onsuccess = handler
      },
      set onerror(handler: (() => void) | null) {
        request.onerror = handler
      },
      succeed: (result: T) => {
        request.result = result
        request.onsuccess?.()
      },
      fail: (error: DOMException | null) => {
        request.error = error
        request.onerror?.()
      },
    } as unknown as IDBRequest<T> & {
      succeed: (result: T) => void
      fail: (error: DOMException | null) => void
    }
  }

  it("resolves with the result", async () => {
    const request = fakeRequest<number>()
    const promise = awaitRequest(request)

    request.succeed(42)

    await expect(promise).resolves.toBe(42)
  })

  it("rejects with a message a person can read, keeping the original as the cause", async () => {
    const request = fakeRequest<number>()
    const promise = awaitRequest(request)
    const original = new DOMException("Quota exceeded", "QuotaExceededError")

    request.fail(original)

    await expect(promise).rejects.toMatchObject({
      message: "The save queue refused a request.",
      cause: original,
    })
  })

  it("rejects readably even when the browser gives no reason", async () => {
    const request = fakeRequest<number>()
    const promise = awaitRequest(request)

    request.fail(null)

    await expect(promise).rejects.toThrow("The save queue refused a request.")
  })
})

describe("durability", () => {
  /*
   * The reason this is IndexedDB and not an array. A save that failed because
   * the network went away must survive the tab being closed — otherwise "queue
   * and retry" is only true until somebody gives up and reloads.
   */
  it("survives a reload", async () => {
    const factory = new IDBFactory()
    const before = createIndexedDbQueue(factory)

    await before.add(entry({ baseVersion: 1 }))
    await before.add(entry({ baseVersion: 2 }))

    // A new queue over the same storage is what a reload produces.
    const after = createIndexedDbQueue(factory)

    expect((await after.all("pag_test")).map((item) => item.baseVersion)).toEqual([1, 2])
  })

  it("keeps the document as the bytes it was given", async () => {
    const factory = new IDBFactory()
    const queue = createIndexedDbQueue(factory)
    const document = '{"version":"1.0.0","nodes":{}}'

    await queue.add(entry({ document }))

    expect((await createIndexedDbQueue(factory).all("pag_test"))[0]?.document).toBe(document)
  })
})

describe("choosing a queue", () => {
  /** A factory whose database cannot be opened, as in a private window. */
  async function blocked(): Promise<IDBFactory> {
    const factory = new IDBFactory()

    // Take the database past the version the queue asks for. A downgrade is
    // refused by every implementation.
    await new Promise<void>((resolve) => {
      const request = factory.open("checkout-studio", 2)
      request.onupgradeneeded = () => request.result.createObjectStore("other")
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
    })

    return factory
  }

  it("keeps the save in memory when IndexedDB is missing entirely", async () => {
    const queue = createDurableQueue(undefined)

    await queue.add(entry())

    // Worse than durable, much better than refusing to edit.
    expect(await queue.all("pag_test")).toHaveLength(1)
  })

  it("falls back rather than rejecting when storage is blocked", async () => {
    const queue = createDurableQueue(await blocked())

    await expect(queue.add(entry())).resolves.toMatchObject({ baseVersion: 1 })
    expect(await queue.all("pag_test")).toHaveLength(1)
  })

  it("says why it degraded, once", async () => {
    const degraded: unknown[] = []
    const queue = createDurableQueue(await blocked(), (error) => degraded.push(error))

    await queue.add(entry())
    await queue.all("pag_test")
    await queue.remove(1)
    await queue.clear("pag_test")

    // One report, not one per call: after the first failure it stops asking.
    expect(degraded).toHaveLength(1)
    expect(degraded[0]).toBeInstanceOf(Error)
  })

  it("does not flip back to the durable queue once it has fallen back", async () => {
    const queue = createDurableQueue(await blocked())

    await queue.add(entry({ baseVersion: 1 }))
    await queue.add(entry({ baseVersion: 2 }))

    // Two queues replaying from two places would replay in an order neither of
    // them knows, so the fallback is permanent.
    expect((await queue.all("pag_test")).map((item) => item.baseVersion)).toEqual([1, 2])
  })

  it("uses IndexedDB when it works, and survives a reload", async () => {
    const factory = new IDBFactory()

    await createDurableQueue(factory).add(entry({ baseVersion: 7 }))

    // A new queue over the same storage is what a reload produces. In memory
    // this would be empty.
    expect((await createDurableQueue(factory).all("pag_test"))[0]?.baseVersion).toBe(7)
  })
})
