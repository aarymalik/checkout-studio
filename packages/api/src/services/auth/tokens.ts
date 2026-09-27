import "server-only"

import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

/**
 * Opaque secrets: session cookies and one-time links.
 *
 * These are random, not chosen, so they are hashed with SHA-256 rather than
 * Argon2id. The reason Argon2id is slow is to make guessing a human-chosen
 * password expensive; there is nothing to guess here. 256 bits of randomness is
 * not reachable by brute force, and making every request pay 60ms to look up a
 * session would be a cost with no attacker on the other side of it.
 *
 * What the hash is for is the database: a leaked table full of hashes yields no
 * working cookie and no working reset link.
 */

/**
 * 32 bytes, base64url.
 *
 * Enough that guessing one is not a strategy, and short enough to sit in a URL
 * without being mangled by an email client that wraps long lines.
 */
export function generateToken(): string {
  return randomBytes(32).toString("base64url")
}

/** What goes in the database. Never the token itself. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/**
 * Compares two secrets without leaking where they diverge.
 *
 * Used where a value is compared in our code rather than looked up by an index
 * — a normal `===` returns as soon as two bytes differ, which over enough
 * attempts is a way to learn a secret one byte at a time.
 */
export function secretsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)

  // timingSafeEqual throws on a length mismatch, which would itself be a
  // signal. Lengths are compared first and the result folded in, so the
  // function always does the same work.
  if (left.length !== right.length) {
    timingSafeEqual(left, left)
    return false
  }

  return timingSafeEqual(left, right)
}

/**
 * How long a one-time link lives.
 *
 * A reset is short because it is the more dangerous of the two and arrives when
 * somebody is already at their keyboard. A verification is longer because it is
 * often opened on another device, later, after the email has been found again.
 */
export const TOKEN_LIFETIME = {
  reset_password: 60 * 60 * 1000,
  verify_email: 24 * 60 * 60 * 1000,
} as const

export function expiryFor(purpose: keyof typeof TOKEN_LIFETIME, now = new Date()): Date {
  return new Date(now.getTime() + TOKEN_LIFETIME[purpose])
}
