"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { useEditorStoreApi } from "@checkout-studio/editor"
import { SESSION_HEARTBEAT_SECONDS } from "@checkout-studio/types"
import { logger } from "@checkout-studio/observability"
import { normalizeError } from "@checkout-studio/utils"

import { post, send } from "@/lib/api-client"
import { useAutosave } from "@/studio/autosave/Autosave"

import { createSessionId, describeClient } from "./identity"

/**
 * The edit session.
 *
 * One writer per page until real-time collaboration exists. Claimed when the
 * editor opens, refreshed every thirty seconds against a ninety-second expiry,
 * and released when the page goes away — so a closed tab frees the page without
 * anybody unlocking anything.
 *
 * This is an ergonomic guard, not a correctness one. A lock can expire under a
 * network partition and two sessions can briefly believe they hold one.
 * Correctness comes from the version on every write, which has no such window.
 * That is why every failure here fails *open*: being locked out of your own
 * page because Redis blinked is far worse than two sessions racing, and the
 * racing is already handled.
 *
 * See docs/history-versioning.md § Session Ownership.
 */

export interface SessionHolder {
  /** "Chrome on macOS", for somebody deciding whether to take the page. */
  clientLabel: string
  lastHeartbeatAt: string
}

export interface EditSessionState {
  /** Null while unknown, which is the first moment after the editor opens. */
  canEdit: boolean | null
  /** Who has it, when it is not us. */
  holder: SessionHolder | null
  /** Whether the page is free to claim, having been held by somebody else. */
  claimable: boolean
  /** Take the page. Available while somebody else holds it. */
  takeOver: () => Promise<void>
  /** Claim a page nobody holds any more. */
  claim: () => Promise<void>
  busy: boolean
}

const EditSessionContext = createContext<EditSessionState | null>(null)

export function useEditSession(): EditSessionState | null {
  return useContext(EditSessionContext)
}

interface ClaimResponse {
  held: boolean
  holder?: SessionHolder
  draftVersion: number
}

export function EditSessionProvider({
  pageId,
  children,
}: {
  pageId: string
  children: ReactNode
}): ReactNode {
  const store = useEditorStoreApi()
  const autosave = useAutosave()

  const [canEdit, setCanEdit] = useState<boolean | null>(null)
  const [holder, setHolder] = useState<SessionHolder | null>(null)
  const [claimable, setClaimable] = useState(false)
  const [busy, setBusy] = useState(false)

  // One id for the life of this mount. A reload is a new session, and
  // re-claiming refreshes the lock rather than failing against the old id.
  const sessionId = useRef<string>(null)
  sessionId.current ??= createSessionId()

  const label = useRef<string>(null)
  label.current ??= describeClient(navigator.userAgent)

  /** Read through a ref so the heartbeat does not restart when it changes. */
  const flush = useRef(autosave?.flush)
  flush.current = autosave?.flush

  /*
   * Writing to the store as well as to React state.
   *
   * The store is what autosave and the panels read — `canEdit` there is what
   * stops a write going out and what greys a panel's controls. This state is
   * for the status bar, which needs more than a boolean.
   */
  const apply = useCallback(
    (allowed: boolean, who: SessionHolder | null) => {
      setCanEdit(allowed)
      setHolder(who)
      setClaimable(false)
      store.getState().setCanEdit(allowed)
    },
    [store],
  )

  const identity = useCallback(
    () => ({ sessionId: sessionId.current as string, clientLabel: label.current as string }),
    [],
  )

  /** Whether this session currently holds the lock, for the release to check. */
  const holding = useRef(false)

  /*
   * Lock operations run one after another, never overlapping.
   *
   * React calls an effect, cleans it up and calls it again on mount in
   * development, so a claim and a release are genuinely in flight together —
   * and unordered, the release landed after the second claim and left the page
   * locked by nobody while this session believed it held it. The second tab
   * then claimed it freely, which is the opposite of the whole feature.
   *
   * Serialising them is the fix rather than suppressing the second effect:
   * re-claiming refreshes a lock this session already holds, so running twice
   * is harmless as long as the order is real.
   */
  const queue = useRef<Promise<unknown>>(null)

  const enqueue = useCallback(<T,>(run: () => Promise<T>): Promise<T> => {
    const next = (queue.current ?? Promise.resolve()).then(run, run)

    queue.current = next.catch(() => undefined)

    return next
  }, [])

  const acquire = useCallback(
    (path: "session" | "session/takeover") =>
      enqueue(async () => {
        const result = await post<ClaimResponse>(`/api/pages/${pageId}/${path}`, identity())

        if (!result.ok) {
          /*
           * Fail open.
           *
           * The lock is an ergonomic guard and this request is not the thing that
           * keeps two writers apart — the version check on every write is. So a
           * claim we could not make means editing proceeds, and a genuine clash
           * surfaces as the conflict it already would have.
           */
          logger.warn("session.claim.failed", { pageId, code: result.code })
          holding.current = false
          apply(true, null)

          return
        }

        const taken = path === "session/takeover" || result.data.held

        holding.current = taken
        apply(taken, taken ? null : (result.data.holder ?? null))
      }),
    [pageId, identity, apply, enqueue],
  )

  // Claim on open. Nothing is released here — that is the release effect's
  // business, and doing it from both is what put them out of order.
  useEffect(() => {
    void acquire("session")
  }, [acquire])

  /*
   * Hold it, or find out that we have not.
   *
   * While we hold the page the heartbeat refreshes the lock, and a `false`
   * answer is how this session learns it has been taken — there is no channel
   * that could tell it sooner. It flushes before going read-only, which is the
   * last chance to persist work while the write is still allowed.
   *
   * While somebody else holds it the same interval polls instead, so the offer
   * to take over appears on its own when the other session ends.
   */
  useEffect(() => {
    if (canEdit === null) return

    const interval = setInterval(() => {
      void (async () => {
        if (canEdit) {
          const result = await send<{ held: boolean }>(
            `/api/pages/${pageId}/session`,
            "PUT",
            identity(),
          )

          // A failed request is not evidence of having lost the page, and
          // treating it as such would make a flaky network read-only.
          if (!result.ok || result.data.held) return

          await flush.current?.()

          logger.warn("session.lost", { pageId })
          holding.current = false
          setCanEdit(false)
          store.getState().setCanEdit(false)

          const who = await send<{ session: SessionHolder | null }>(
            `/api/pages/${pageId}/session`,
            "GET",
          )

          setHolder(who.ok ? who.data.session : null)
          setClaimable(who.ok && who.data.session === null)

          return
        }

        const who = await send<{ session: SessionHolder | null }>(
          `/api/pages/${pageId}/session`,
          "GET",
        )

        if (!who.ok) return

        // Offered rather than taken. Somebody reading a page should not start
        // holding its lock because the other tab closed.
        setHolder(who.data.session)
        setClaimable(who.data.session === null)
      })()
    }, SESSION_HEARTBEAT_SECONDS * 1_000)

    return () => {
      clearInterval(interval)
    }
  }, [canEdit, pageId, identity, store])

  /*
   * Give the page up when this one goes away.
   *
   * Depends on the page alone. With `canEdit` in here it re-ran every time the
   * answer changed, and each re-run's cleanup gave the lock back.
   *
   * Only an optimisation: a session that stops heartbeating expires within
   * ninety seconds either way, which is what makes "no manual unlock is ever
   * required" true.
   */
  useEffect(() => {
    const id = sessionId.current as string
    const onLeave = (): void => {
      if (!holding.current) return

      holding.current = false
      void enqueue(() => release(pageId, id))
    }

    window.addEventListener("pagehide", onLeave)

    return () => {
      window.removeEventListener("pagehide", onLeave)
      onLeave()
    }
  }, [pageId, enqueue])

  const act = useCallback(
    async (path: "session" | "session/takeover") => {
      setBusy(true)

      try {
        await acquire(path)
      } finally {
        setBusy(false)
      }
    },
    [acquire],
  )

  return (
    <EditSessionContext.Provider
      value={{
        canEdit,
        holder,
        claimable,
        busy,
        takeOver: () => act("session/takeover"),
        claim: () => act("session"),
      }}
    >
      {children}
    </EditSessionContext.Provider>
  )
}

/**
 * Hand the page back.
 *
 * `keepalive` so the request outlives the page that sent it. `sendBeacon` cannot
 * be used: it only sends POST, and releasing is a DELETE carrying the session id
 * that is allowed to do it.
 */
function release(pageId: string, sessionId: string): Promise<void> {
  return fetch(`/api/pages/${pageId}/session`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId }),
    keepalive: true,
  })
    .then(() => undefined)
    .catch((thrown: unknown) => {
      // Nothing to do about it, and nothing broken: the lock expires in ninety
      // seconds regardless, which is what makes this an optimisation.
      logger.warn("session.release.failed", {}, normalizeError(thrown))
    })
}
