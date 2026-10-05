import "server-only"

import { redis } from "@checkout-studio/cache"
import { SESSION_HEARTBEAT_SECONDS, SESSION_TTL_SECONDS } from "@checkout-studio/types"

/**
 * Edit sessions.
 *
 * One writer per page. Not a correctness mechanism — a lock can expire under a
 * network partition and two sessions can briefly believe they hold it — but an
 * ergonomic one: it is what turns "your changes were rejected" into "this page
 * is open somewhere else, take over or read".
 *
 * Correctness comes from version checking on every write, which has no such
 * window. See docs/history-versioning.md § Session Ownership.
 */

/*
 * Re-exported rather than defined here.
 *
 * The client has to speak before the lock expires, so these are a contract
 * between the two halves and live in a layer both can reach — this module is
 * `server-only`.
 */
export { SESSION_HEARTBEAT_SECONDS, SESSION_TTL_SECONDS }

export interface EditSession {
  pageId: string
  sessionId: string
  userId: string
  /** Human label for the takeover prompt: "Chrome on macOS". */
  clientLabel: string
  /** Draft version this session started from. */
  baseVersion: number
  startedAt: string
  lastHeartbeatAt: string
}

export type ClaimResult =
  | { held: true; session: EditSession }
  /** Somebody else has it. The prompt shows who and how recently. */
  | { held: false; holder: EditSession }

/*
 * Namespaced away from `cs:session:`, which holds sign-in sessions.
 *
 * The two never collide on a value — a page id is not a token hash — but they
 * shared a prefix, and anything that globs `cs:session:*` to count, audit or
 * clear sessions would have treated edit locks as logins. Clearing the wrong
 * class of those signs everybody out.
 */
export function sessionKey(pageId: string): string {
  return `cs:page-session:${pageId}`
}

/**
 * What is stored against a page.
 *
 * Three answers, not two. "Nothing is there" and "something is there that we
 * cannot read" look the same to a caller that only checks for null, and they
 * call for opposite behaviour: one means try again, the other means take it.
 */
type Held = { state: "held"; session: EditSession } | { state: "free" } | { state: "unreadable" }

async function read(pageId: string): Promise<Held> {
  const raw = await redis.get(sessionKey(pageId))

  if (raw === null) return { state: "free" }

  try {
    return { state: "held", session: JSON.parse(raw) as EditSession }
  } catch {
    // A value we cannot read is a value we cannot honour. Taking the page is
    // better than leaving it locked by nobody, forever.
    return { state: "unreadable" }
  }
}

async function write(session: EditSession): Promise<void> {
  await redis.set(sessionKey(session.pageId), JSON.stringify(session), "EX", SESSION_TTL_SECONDS)
}

/**
 * Take the lock, or report who has it.
 *
 * `SET NX` so two simultaneous claims cannot both succeed. Re-claiming a
 * session you already hold refreshes it rather than failing: a reload should
 * not lock somebody out of their own page for ninety seconds.
 */
export async function claim(input: {
  pageId: string
  sessionId: string
  userId: string
  clientLabel: string
  baseVersion: number
  now?: Date
}): Promise<ClaimResult> {
  const at = (input.now ?? new Date()).toISOString()
  const session: EditSession = {
    pageId: input.pageId,
    sessionId: input.sessionId,
    userId: input.userId,
    clientLabel: input.clientLabel,
    baseVersion: input.baseVersion,
    startedAt: at,
    lastHeartbeatAt: at,
  }

  const acquired = await redis.set(
    sessionKey(input.pageId),
    JSON.stringify(session),
    "EX",
    SESSION_TTL_SECONDS,
    "NX",
  )

  if (acquired !== null) return { held: true, session }

  const held = await read(input.pageId)

  /*
   * Two ways to end up here holding the page anyway.
   *
   * Free: it expired between the SET and the GET, so nobody holds it. Taking it
   * outright rather than retrying, because a retry can lose the same race again
   * and there is no bound on how many times.
   *
   * Unreadable: something is stored that is not a session. Retrying would spin
   * forever, since the value that made SET NX fail is still there.
   */
  if (held.state !== "held" || held.session.sessionId === input.sessionId) {
    await write(session)

    return { held: true, session }
  }

  return { held: false, holder: held.session }
}

/**
 * Refresh a session you hold.
 *
 * Returns false when it has expired or been taken, which is how a client learns
 * it has lost the page without being told by anything else.
 */
export async function heartbeat(input: {
  pageId: string
  sessionId: string
  now?: Date
}): Promise<boolean> {
  const held = await read(input.pageId)

  if (held.state !== "held" || held.session.sessionId !== input.sessionId) return false

  await write({
    ...held.session,
    lastHeartbeatAt: (input.now ?? new Date()).toISOString(),
  })

  return true
}

/**
 * Take the page from whoever holds it.
 *
 * The transfer itself is unconditional; what makes it safe is the order around
 * it. The losing session is told first and flushes its pending autosave before
 * the lock moves, so a takeover can never discard unsaved work — see the flush
 * ordering in docs/history-versioning.md § Takeover.
 */
export async function takeover(input: {
  pageId: string
  sessionId: string
  userId: string
  clientLabel: string
  baseVersion: number
  now?: Date
}): Promise<EditSession> {
  const at = (input.now ?? new Date()).toISOString()
  const session: EditSession = {
    pageId: input.pageId,
    sessionId: input.sessionId,
    userId: input.userId,
    clientLabel: input.clientLabel,
    baseVersion: input.baseVersion,
    startedAt: at,
    lastHeartbeatAt: at,
  }

  await write(session)

  return session
}

/** Give up the page. Closing a tab does the same thing, ninety seconds later. */
export async function release(pageId: string, sessionId: string): Promise<boolean> {
  const held = await read(pageId)

  // Only the holder may release it. Otherwise a stale client's unload handler
  // unlocks the page somebody else just took over.
  if (held.state !== "held" || held.session.sessionId !== sessionId) return false

  await redis.del(sessionKey(pageId))

  return true
}

/** Who holds the page, if anyone. */
export async function current(pageId: string): Promise<EditSession | null> {
  const held = await read(pageId)

  return held.state === "held" ? held.session : null
}
