/**
 * URL slugs.
 *
 * A slug is derived once, when a project is created, and then left alone —
 * renaming a project does not move its URL, because a link somebody shared
 * should keep working.
 */

const MAXIMUM_LENGTH = 60

/**
 * A name as a slug, or an empty string when nothing survives.
 *
 * Accents are folded rather than dropped, so "Café" becomes "cafe" and not "caf".
 */
export function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      // Combining marks left behind by the decomposition above.
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, MAXIMUM_LENGTH)
      .replace(/-+$/, "")
  )
}

/**
 * A slug that is not already taken.
 *
 * Suffixes with a number rather than a random string: "checkout-2" is something
 * a person can read out loud, and a collision is rare enough that counting is
 * cheaper than generating.
 */
export function uniqueSlug(name: string, taken: Iterable<string>, fallback = "project"): string {
  const base = slugify(name) || fallback
  const used = new Set(taken)

  if (!used.has(base)) return base

  let suffix = 2
  while (used.has(`${base}-${suffix}`)) suffix += 1

  return `${base}-${suffix}`
}
