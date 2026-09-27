import "server-only"

import { randomBytes } from "node:crypto"
import { hash, verify } from "@node-rs/argon2"
import { COMMON_PASSWORDS } from "./common-passwords"

/**
 * Passwords.
 *
 * Argon2id rather than bcrypt: it resists GPU and ASIC attack through memory
 * cost, which is the attack a leaked table actually faces. See
 * docs/security.md § Passwords.
 */

/**
 * The work each hash costs.
 *
 * Measured at 58ms on an M-series laptop and several times that on the shared
 * vCPUs this deploys to, which is the number that matters — a tenth of a second
 * is unnoticeable to someone signing in and ruinous to someone working through
 * a leaked table.
 *
 * Well above OWASP's floor of 19 MiB and two passes. Memory is the dimension
 * worth spending on: time cost buys a linear improvement, memory cost prices
 * out the hardware.
 *
 * Raising these later is safe. The hash records the parameters it was made
 * with, so `verifyPassword` reports when one is out of date and the caller
 * rehashes it on the next successful sign-in.
 */
const PARAMETERS = {
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
} as const

/**
 * The shortest password accepted.
 *
 * Twelve, with no composition rules. A rule that demands a symbol and forbids a
 * space rejects a good passphrase and accepts "P@ssw0rd!"; length is the
 * property that actually costs an attacker something.
 */
export const MINIMUM_LENGTH = 12

/**
 * The longest.
 *
 * Long enough that nobody meets it in practice, and short enough that a
 * megabyte of text cannot be used to make the server do expensive work.
 */
export const MAXIMUM_LENGTH = 256

export type PasswordProblem = "too-short" | "too-long" | "too-common"

/**
 * Reduces a password to what an attacker's wordlist would call it.
 *
 * "P@ssw0rd!23" is not a different guess from "password" — it is the same word
 * wearing the disguise a composition rule demanded. An exact-match list misses
 * every one of these, which is most of what people actually choose when told to
 * add a number and a symbol.
 *
 * Deliberately one-way and lossy: this is only ever used to reject.
 */
const LEET: ReadonlyArray<readonly [RegExp, string]> = [
  [/@/g, "a"],
  [/\$/g, "s"],
  [/!/g, "i"],
  [/0/g, "o"],
  [/1/g, "i"],
  [/3/g, "e"],
  [/4/g, "a"],
  [/5/g, "s"],
  [/7/g, "t"],
]

function reduce(password: string): string {
  // The suffix comes off before the substitutions, not after. Decoding first
  // turns the "1234" in "p@ssw0rd1234" into letters, which then look like part
  // of the word and survive the strip — the disguise this exists to see
  // through, defeating it.
  let reduced = password
    .toLowerCase()
    .replaceAll(/[\s._\-*#]/g, "")
    .replace(/[^a-z]+$/, "")

  for (const [pattern, letter] of LEET) reduced = reduced.replaceAll(pattern, letter)

  return reduced.replace(/[^a-z]+$/, "")
}

/**
 * Whether a password may be used.
 *
 * The common-password list is bundled rather than looked up over the network:
 * a check that depends on a third party is a signup page that breaks when they
 * have an outage, and the passwords people reuse are not a long tail.
 */
export function checkPassword(password: string): PasswordProblem | null {
  if (password.length < MINIMUM_LENGTH) return "too-short"
  if (password.length > MAXIMUM_LENGTH) return "too-long"

  const lowered = password.toLowerCase()
  if (COMMON_PASSWORDS.has(lowered) || COMMON_PASSWORDS.has(reduce(password))) {
    return "too-common"
  }

  return null
}

/** Hashes a password for storage. The result carries its own parameters. */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, PARAMETERS)
}

export interface VerificationResult {
  valid: boolean
  /**
   * Whether the stored hash was made with weaker parameters than the current
   * ones. True means: this password is correct, and should be rehashed now,
   * while it is in memory and known to be right.
   */
  needsRehash: boolean
}

/**
 * Checks a password against a stored hash.
 *
 * Returns false rather than throwing when the stored value is not a hash at
 * all — an account migrated from an identity provider has a placeholder, and
 * that account should be told its password is wrong, not handed a 500.
 */
export async function verifyPassword(
  storedHash: string,
  password: string,
): Promise<VerificationResult> {
  try {
    const valid = await verify(storedHash, password)
    return { valid, needsRehash: valid && isOutdated(storedHash) }
  } catch {
    // Not a hash this library recognises. Nothing verifies against it.
    return { valid: false, needsRehash: false }
  }
}

/**
 * Spends the same time as a real verification, and reports nothing.
 *
 * Called when no account exists for an address. Without it, a sign-in attempt
 * for an unknown address returns in microseconds while a real one takes a
 * tenth of a second — which is a way to enumerate every customer, one request
 * at a time, no matter how carefully the response body is worded.
 */
export async function verifyAgainstNothing(password: string): Promise<void> {
  await verifyPassword(await decoyHash(), password)
}

/**
 * A hash of a value nobody knows, made with the current parameters.
 *
 * Generated rather than written down. A hand-written constant that is not
 * actually a valid Argon2id hash is rejected in microseconds, which would leave
 * this function costing nothing and the timing difference it exists to hide
 * fully intact.
 *
 * Computed once, lazily: a process that never sees a sign-in attempt for an
 * unknown address never pays for it.
 */
let decoy: Promise<string> | undefined

function decoyHash(): Promise<string> {
  decoy ??= hashPassword(randomBytes(32).toString("hex"))
  return decoy
}

/** Exposed for the test that asserts the decoy is a real hash. */
export const __decoyHashForTests = decoyHash

/** The parameters a stored hash was made with, or null if it is not one. */
export function parseParameters(
  storedHash: string,
): { memoryCost: number; timeCost: number; parallelism: number } | null {
  const matched = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(storedHash)
  if (matched === null) return null

  return {
    memoryCost: Number(matched[1]),
    timeCost: Number(matched[2]),
    parallelism: Number(matched[3]),
  }
}

/** The parameters in force. Read by tests; the service uses them directly. */
export const CURRENT_PARAMETERS = PARAMETERS

/** Whether a stored hash was made with weaker parameters than we now use. */
function isOutdated(storedHash: string): boolean {
  const parameters = parseParameters(storedHash)
  if (parameters === null) return false

  return (
    parameters.memoryCost < PARAMETERS.memoryCost ||
    parameters.timeCost < PARAMETERS.timeCost ||
    parameters.parallelism < PARAMETERS.parallelism
  )
}
