import "server-only"

import { compareVersions } from "@checkout-studio/schema"

/**
 * Whether a version satisfies the range a bundle asks for.
 *
 * ## Only the ranges we write, and an honest answer for the rest
 *
 * A bundle's requirements are written by an exporter, and ours writes `^x.y.z`
 * — see `pluginRequirements`. A bundle from a future version of this product,
 * or from somebody else's implementation of the format, may carry a range this
 * cannot read, and the useful answer there is "I cannot tell" rather than a
 * guess in either direction. Guessing *satisfied* installs something that will
 * not render; guessing *unsatisfied* refuses a bundle that would have been
 * fine.
 *
 * Not a semver library, deliberately. The whole surface is a caret and an
 * exact version, and a dependency that parses `>=1.2.7 <1.3.0 || 2.x` would be
 * carrying a grammar nothing in this product emits.
 *
 * ## The caret narrows below 1.0.0
 *
 * npm's rule, because it is the one the range was written with. `^1.2.3`
 * allows anything below `2.0.0`; `^0.1.2` allows anything below `0.2.0`; and
 * `^0.0.3` allows only `0.0.3`. While this product is pre-1.0 that strictness
 * is the point — a minor version is where everything still moves.
 */

export type RangeVerdict =
  | "satisfied"
  | "unsatisfied"
  /** The range is not one this build knows how to read. */
  | "unreadable"

const EXACT = /^\d+\.\d+\.\d+$/u
const CARET = /^\^(\d+)\.(\d+)\.(\d+)$/u

export function satisfies(version: string, range: string): RangeVerdict {
  if (!EXACT.test(version)) return "unreadable"

  if (EXACT.test(range)) return compareVersions(version, range) === 0 ? "satisfied" : "unsatisfied"

  const caret = CARET.exec(range)

  if (caret === null) return "unreadable"

  const [, major = "", minor = ""] = caret
  const floor = range.slice(1)

  if (compareVersions(version, floor) < 0) return "unsatisfied"

  /*
   * The first version the range excludes. Below 1.0.0 a minor bump is a
   * breaking change and below 0.1.0 a patch is, which is npm's reading and
   * the one the exporter wrote the caret with.
   */
  const ceiling =
    major !== "0"
      ? `${String(Number(major) + 1)}.0.0`
      : minor !== "0"
        ? `0.${String(Number(minor) + 1)}.0`
        : `0.0.${String(Number(caret[3]) + 1)}`

  return compareVersions(version, ceiling) < 0 ? "satisfied" : "unsatisfied"
}
