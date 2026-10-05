/**
 * The edit-session contract.
 *
 * Shared because both halves have to agree: the server expires a lock it has
 * not heard from, and the client is the thing that has to speak in time. Two
 * copies of these numbers drift, and the drift shows up as a page that locks
 * people out for ninety seconds at a time.
 *
 * The service that enforces them is `server-only`, so they cannot live beside
 * it — see docs/history-versioning.md § Session Ownership.
 */

/** A session that stops heartbeating expires within this. No unlock is needed. */
export const SESSION_TTL_SECONDS = 90

/** How often the holder refreshes it: three chances to miss one before expiry. */
export const SESSION_HEARTBEAT_SECONDS = 30
