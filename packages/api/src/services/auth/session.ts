import "server-only"

import { createHmac } from "node:crypto"
import { del, get, set } from "@checkout-studio/cache"
import { sessionRepository } from "@checkout-studio/database"
import { generateToken, hashToken } from "./tokens"
import { SESSION_COOKIE } from "../../edge"

/**
 * Sessions.
 *
 * A session is a row, not a signed claim. A claim is valid until it expires no
 * matter what is learned about it in between; a row can be ended. That is what
 * makes "sign out everywhere" possible and a stolen cookie recoverable, and it
 * is the whole reason for the extra lookup.
 *
 * See docs/security.md § Session Security.
 */

/** Thirty days, renewed by use. Long enough not to be a nuisance, short enough to matter. */
export const SESSION_LIFETIME = 30 * 24 * 60 * 60 * 1000

// Defined on the edge-safe side, because the proxy needs the name before it
// has anywhere to resolve a session against.
export { SESSION_COOKIE }

/**
 * How long a resolved session may be served from cache.
 *
 * Short, and belt-and-braces. Revocation drops the entry explicitly — the cache
 * is not allowed to be the reason a revoked session keeps working — but a drop
 * that fails for any reason should expire in a minute rather than persist for
 * the life of the session.
 */
const CACHE_TTL_SECONDS = 60

export interface SessionIdentity {
  sessionId: string
  userId: string
  email: string
  platformRole: string
  emailVerified: boolean
}

export interface SessionOrigin {
  userAgent?: string | undefined
  ip?: string | undefined
}

/**
 * A one-way, keyed fingerprint of an address.
 *
 * Keyed rather than plain: an unkeyed hash of an IPv4 address is reversible by
 * trying all four billion of them, which is minutes of work. With a key it is
 * only comparable, which is all it is for — telling "the same network as last
 * time" from "somewhere new". It is never shown to anyone.
 */
function fingerprintIp(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(ip).digest("hex").slice(0, 32)
}

function cacheKey(tokenHash: string): string {
  return `cs:session:${tokenHash}`
}

export interface IssuedSession {
  /** Goes in the cookie. Never stored. */
  token: string
  expiresAt: Date
  sessionId: string
}

/** Starts a session and returns the cookie value exactly once. */
export async function createSession(
  userId: string,
  origin: SessionOrigin,
  secret: string,
  now = new Date(),
): Promise<IssuedSession> {
  const token = generateToken()
  const expiresAt = new Date(now.getTime() + SESSION_LIFETIME)

  const session = await sessionRepository.create({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    ...(origin.userAgent === undefined ? {} : { userAgent: origin.userAgent }),
    ...(origin.ip === undefined ? {} : { ipHash: fingerprintIp(origin.ip, secret) }),
  })

  return { token, expiresAt, sessionId: session.id }
}

/**
 * Who a cookie belongs to, or null.
 *
 * Null covers every reason equally: no such session, revoked, expired. The
 * caller cannot tell which, and neither can anyone probing it.
 */
export async function resolveSession(token: string): Promise<SessionIdentity | null> {
  const tokenHash = hashToken(token)

  const cached = await get<SessionIdentity>(cacheKey(tokenHash))
  if (cached !== undefined) return cached

  const session = await sessionRepository.resolve(tokenHash)
  if (session === null) return null

  const identity: SessionIdentity = {
    sessionId: session.id,
    userId: session.userId,
    email: session.user.email,
    platformRole: session.user.platformRole,
    emailVerified: session.user.emailVerifiedAt !== null,
  }

  await set(cacheKey(tokenHash), identity, { ttl: CACHE_TTL_SECONDS })

  return identity
}

/** Ends the session a cookie names. Idempotent: signing out twice is not an error. */
export async function endSession(userId: string, sessionId: string): Promise<boolean> {
  const tokenHash = await sessionRepository.revoke(userId, sessionId)
  if (tokenHash === null) return false

  // The cache is dropped, not left to expire. A revocation the cache does not
  // hear about is a session that keeps working for another minute — which is
  // exactly the minute somebody is trying to close.
  await del(cacheKey(tokenHash))

  return true
}

/**
 * Ends every session but the one asking.
 *
 * What a password change does, and what the "sign out everywhere" button does.
 * Passing null for `keepSessionId` ends that one too, which is what a reset
 * does: the person performing it is not signed in.
 */
export async function endOtherSessions(
  userId: string,
  keepSessionId: string | null,
): Promise<number> {
  const revoked = await sessionRepository.revokeAllExcept(userId, keepSessionId)

  if (revoked.length > 0) {
    await del(...revoked.map(cacheKey))
  }

  return revoked.length
}

/** The sessions a person can see and end. Carries no token, hashed or otherwise. */
export async function listSessions(userId: string) {
  return sessionRepository.listFor(userId)
}

/** Records that a session was used, for the list. */
export async function touchSession(sessionId: string): Promise<void> {
  await sessionRepository.touch(sessionId)
}

/**
 * The cookie a session is carried in.
 *
 * HttpOnly so script cannot read it, Secure so it never crosses plain HTTP,
 * SameSite=Lax so it is not sent on a cross-site POST — which is CSRF
 * protection that costs nothing and needs no token.
 *
 * Path is the whole site because the Studio and its API share an origin.
 */
export function sessionCookie(
  value: string,
  expiresAt: Date,
  secure: boolean,
): {
  name: string
  value: string
  options: {
    httpOnly: true
    secure: boolean
    sameSite: "lax"
    path: string
    expires: Date
  }
} {
  return {
    name: SESSION_COOKIE,
    value,
    options: {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    },
  }
}

/** The same cookie, already expired. What signing out sets. */
export function clearedSessionCookie(secure: boolean) {
  return sessionCookie("", new Date(0), secure)
}

/**
 * The cookie as a Set-Cookie header value.
 *
 * Written out rather than pulled from a library: it is five attributes, all of
 * them decided above, and a dependency here would be a dependency in the path
 * of every sign-in.
 */
export function serializeCookie(cookie: ReturnType<typeof sessionCookie>): string {
  const parts = [
    `${cookie.name}=${encodeURIComponent(cookie.value)}`,
    `Path=${cookie.options.path}`,
    `Expires=${cookie.options.expires.toUTCString()}`,
    "HttpOnly",
    // Lax, always: the attribute is typed as the one value, so a branch here
    // would be a branch nothing can take.
    "SameSite=Lax",
  ]

  if (cookie.options.secure) parts.push("Secure")

  return parts.join("; ")
}
