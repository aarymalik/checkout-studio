/**
 * The offline save queue.
 *
 * A save that fails because the network went away must not be lost, and must
 * not be lost by closing the tab either — which is the whole reason this is
 * durable rather than an array in memory.
 *
 * Entries replay in the order they were made. Out of order, an older document
 * would overwrite a newer one; and because each carries the version it was
 * written against, a replay that has already been applied is refused by the
 * server rather than applied twice.
 *
 * See docs/phases.md, Phase 5 § Autosave.
 */

export interface QueuedSave {
  /** Monotonic within a queue, so replay order is the order of editing. */
  id: number
  pageId: string
  /** The canonical JSON of the document. Bytes, so nothing can mutate underneath. */
  document: string
  baseVersion: number
  queuedAt: number
}

export interface SaveQueue {
  add: (entry: Omit<QueuedSave, "id">) => Promise<QueuedSave>
  /** Everything waiting, oldest first. */
  all: (pageId: string) => Promise<readonly QueuedSave[]>
  remove: (id: number) => Promise<void>
  clear: (pageId: string) => Promise<void>
}

/**
 * A queue that forgets when the tab closes.
 *
 * For tests, and for a browser where IndexedDB is unavailable — a private
 * window with storage blocked, most often. Losing the queue on close is worse
 * than keeping it; it is much better than refusing to edit.
 */
export function createMemoryQueue(): SaveQueue {
  let entries: QueuedSave[] = []
  let nextId = 1

  return {
    add: async (entry) => {
      const queued: QueuedSave = { ...entry, id: nextId }
      nextId += 1
      entries = [...entries, queued]

      return queued
    },
    all: async (pageId) => entries.filter((entry) => entry.pageId === pageId),
    remove: async (id) => {
      entries = entries.filter((entry) => entry.id !== id)
    },
    clear: async (pageId) => {
      entries = entries.filter((entry) => entry.pageId !== pageId)
    },
  }
}

export const DATABASE_NAME = "checkout-studio"
export const STORE_NAME = "save-queue"
const VERSION = 1

function open(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, VERSION)

    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE_NAME, {
        keyPath: "id",
        autoIncrement: true,
      })

      // Replay is per page, and a person may have several open.
      store.createIndex("pageId", "pageId", { unique: false })
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(new Error("Could not open the save queue.", { cause: request.error }))
  })
}

/**
 * An IndexedDB request as a promise.
 *
 * Exported so the failure path can be tested. A request fails for reasons no
 * test can arrange through the queue's own API — the disk is full, the
 * transaction was aborted, the browser reclaimed storage — and an untested
 * error translator is one that throws something unreadable on the day it runs.
 */
export function awaitRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(new Error("The save queue refused a request.", { cause: request.error }))
  })
}

/**
 * A queue that survives a reload.
 *
 * IndexedDB rather than localStorage: a document is larger than localStorage is
 * meant to hold, and writing one synchronously would block the thread that is
 * drawing the canvas.
 */
export function createIndexedDbQueue(factory: IDBFactory): SaveQueue {
  const database = open(factory)

  async function transaction<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => Promise<T>,
  ): Promise<T> {
    const db = await database

    return run(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME))
  }

  return {
    add: async (entry) =>
      transaction("readwrite", async (store) => {
        const id = await awaitRequest(store.add(entry) as IDBRequest<IDBValidKey>)

        return { ...entry, id: Number(id) }
      }),

    all: async (pageId) =>
      transaction("readonly", async (store) => {
        const entries = await awaitRequest(
          store.index("pageId").getAll(pageId) as IDBRequest<QueuedSave[]>,
        )

        // By id, which is assigned in the order entries were made. The index
        // does not promise an order, and replaying a stale document over a
        // newer one is exactly what this queue exists to prevent.
        return [...entries].sort((left, right) => left.id - right.id)
      }),

    remove: async (id) =>
      transaction("readwrite", async (store) => {
        await awaitRequest(store.delete(id))
      }),

    clear: async (pageId) =>
      transaction("readwrite", async (store) => {
        const keys = await awaitRequest(
          store.index("pageId").getAllKeys(pageId) as IDBRequest<IDBValidKey[]>,
        )

        for (const key of keys) await awaitRequest(store.delete(key))
      }),
  }
}

/**
 * The best queue this browser can give us, degrading rather than failing.
 *
 * IndexedDB is unavailable in a private window with storage blocked, and it can
 * also accept the open and then refuse every request — the disk is full, the
 * origin's storage was reclaimed. Either way the answer is the same: a save
 * that cannot be queued durably is queued in memory, because losing the queue
 * when the tab closes is much better than refusing to edit.
 *
 * The fallback is permanent once taken. A queue that flips back and forth would
 * replay entries from two places in an order neither of them knows.
 */
export function createDurableQueue(
  factory: IDBFactory | undefined,
  onDegrade?: (error: unknown) => void,
): SaveQueue {
  const memory = createMemoryQueue()

  if (factory === undefined) return memory

  let durable: SaveQueue | null = createIndexedDbQueue(factory)

  async function attempt<T>(run: (queue: SaveQueue) => Promise<T>): Promise<T> {
    if (durable === null) return run(memory)

    try {
      return await run(durable)
    } catch (error) {
      durable = null
      onDegrade?.(error)

      return run(memory)
    }
  }

  return {
    add: async (entry) => attempt((queue) => queue.add(entry)),
    all: async (pageId) => attempt((queue) => queue.all(pageId)),
    remove: async (id) => attempt((queue) => queue.remove(id)),
    clear: async (pageId) => attempt((queue) => queue.clear(pageId)),
  }
}
