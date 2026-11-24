/**
 * The published loader builds a merchant can pin.
 *
 * docs/rfcs/0002-embed-security-model.md § 9. `/embed.js` is the living
 * loader and carries no integrity hash, because its whole purpose is that a
 * fix reaches a merchant's page without them editing it. A hash pins bytes;
 * those two cannot both be true of one URL.
 *
 * So there are two offers, and the Studio states the trade rather than
 * choosing for them:
 *
 * ```
 * /embed.js           fixes arrive on their own, no integrity attribute
 * /embed/v1.js        bytes never change, integrity attribute, update by hand
 * ```
 *
 * A version here is frozen. Its hash is checked by a test against the file
 * on disk, so a reformat — or a fix applied to the wrong copy — fails the
 * build rather than every pinned checkout.
 */

export interface LoaderVersion {
  /** The path it is served from, below the renderer's origin. */
  path: string
  /** Its Subresource Integrity hash, over exactly those bytes. */
  integrity: string
}

/**
 * Newest last. The Studio offers the last one, and the earlier entries stay
 * because pages are pinned to them.
 */
export const LOADER_VERSIONS: readonly LoaderVersion[] = [
  {
    path: "/embed/v1.js",
    integrity: "sha384-Bhz8asdL/tIfcfhSOW9lM7jvTiTTkzSI2YeReg/Oh4mWe8JNJFmLpRq4g4YTZ0Vf",
  },
]

/** What a merchant pinning today should pin to. */
export function currentLoader(): LoaderVersion {
  const latest = LOADER_VERSIONS.at(-1)

  if (latest === undefined) throw new Error("there is no published loader version")

  return latest
}
