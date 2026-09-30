/**
 * Node identifiers.
 *
 * Readable on purpose: `heading_h82k` in a diff, a log line or a conflict
 * summary tells you what broke without a lookup, which `n_01H8X…` does not.
 *
 * An id never changes once assigned. Duplicating a subtree mints new ones and
 * rewrites every reference to them; nothing else regenerates an id, because a
 * revision, a comment and an analytics event all point at one.
 */

/** The alphabet, minus the characters that are misread aloud: 0/O, 1/l/I. */
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"

const SUFFIX_LENGTH = 4

/**
 * The readable part of a type id: `core.order-summary` → `order-summary`.
 *
 * Kept as-is rather than shortened. `ordersummary_x7d9` reads worse than
 * `order-summary_x7d9`, and the few bytes are not worth the ambiguity.
 */
export function prefixFor(type: string): string {
  const name = type.slice(type.lastIndexOf(".") + 1)

  // A type id is `<namespace>.<kebab-name>` by contract, but an imported
  // document is not under our control until it has been validated — and this
  // runs while building the thing that validates it.
  return name.replace(/[^a-z0-9-]/gi, "").toLowerCase() || "node"
}

/**
 * Random suffix generation, injectable.
 *
 * Tests need collisions to be reproducible, and a duplicate of a 2,000-node
 * subtree needs 2,000 ids that cannot collide with each other or with anything
 * already in the document.
 */
export type RandomSource = () => number

function suffix(random: RandomSource): string {
  let result = ""

  for (let index = 0; index < SUFFIX_LENGTH; index += 1) {
    const position = Math.floor(random() * ALPHABET.length)
    result += ALPHABET[Math.min(position, ALPHABET.length - 1)]
  }

  return result
}

/**
 * A fresh id for a node of this type, avoiding everything in `taken`.
 *
 * Retries on collision rather than widening the suffix: at four characters from
 * a 31-symbol alphabet there are ~924,000 per type, and a page has thousands of
 * nodes at most. Widening after enough retries keeps it terminating even with a
 * degenerate random source, which is exactly what a test supplies.
 */
export function createId(
  type: string,
  taken: ReadonlySet<string>,
  random: RandomSource = Math.random,
): string {
  const prefix = prefixFor(type)

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = `${prefix}_${suffix(random)}`

    if (!taken.has(candidate)) return candidate
  }

  // Every short id is taken, or the random source is not random. Lengthen until
  // it is free; this cannot loop forever because the counter always grows.
  let counter = 0
  let candidate = `${prefix}_${suffix(random)}${counter}`

  while (taken.has(candidate)) {
    counter += 1
    candidate = `${prefix}_${suffix(random)}${counter}`
  }

  return candidate
}
