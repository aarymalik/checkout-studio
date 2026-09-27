/**
 * The part of this package that runs anywhere.
 *
 * No database, no `server-only`, no Node builtins — the proxy runs on the edge
 * runtime, where none of those exist. It holds the handful of values a request
 * can be inspected with before there is anywhere to resolve it against.
 *
 * Presence is not proof. Nothing here can tell whether a session is real; that
 * needs the database, and happens where the database is.
 */

/** The cookie a session is carried in. */
export const SESSION_COOKIE = "cs_session"

/** Where someone is sent to sign in, and the parameter that brings them back. */
export const SIGN_IN_PATH = "/sign-in"
export const RETURN_TO = "next"
