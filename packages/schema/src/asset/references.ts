import type { CheckoutSchema, PropValue } from "../document/schema"
import { traverse } from "../tree/traverse"

/**
 * Every asset a document refers to.
 *
 * ## Two callers, one walk
 *
 * The renderer needs this to know which assets to load before it can turn
 * `{ "$asset": "ast_9f2a" }` into URLs, and deleting an asset needs it to know
 * whether anything still points at it. Both are the same question asked from
 * different ends, so there is one answer to keep correct — and a walk that
 * missed a place a reference can hide would be a broken image in one case and a
 * deleted file still in use in the other.
 *
 * ## Where a reference can be
 *
 * Props, nested to any depth: a list of features is an array of objects and
 * each may carry an icon. Plus the two fields in `settings` that name one —
 * the social image and the favicon.
 *
 * Not styles. A style value is a string, a number, a boolean or null, and an
 * asset reference is an object, which is why a background image is a prop and
 * cannot be responsive. That is stated where the property is declared, and it
 * is the reason this walk does not look there.
 */

function isReference(value: object): value is { $asset: string } {
  return "$asset" in value && typeof (value as { $asset: unknown }).$asset === "string"
}

function collectFrom(value: PropValue, found: Set<string>): void {
  if (value === null || typeof value !== "object") return

  if (Array.isArray(value)) {
    for (const entry of value) collectFrom(entry, found)

    return
  }

  if (isReference(value)) {
    found.add(value.$asset)

    return
  }

  /*
   * A `$var` reference lands here and contributes nothing, which is right: a
   * variable's value arrives at render time and may be anything, so a document
   * cannot say in advance which asset it will name. An asset chosen through a
   * variable is a reference this cannot see — and so is one nothing can, which
   * is why the control writes a reference rather than a variable.
   */
  for (const entry of Object.values(value)) collectFrom(entry, found)
}

/**
 * The asset ids this document names, each once.
 *
 * A set rather than a list, because the same logo on six nodes is one asset to
 * load and one row to count as in use.
 */
export function assetReferences(document: CheckoutSchema): ReadonlySet<string> {
  const found = new Set<string>()

  traverse(document, ({ node }) => {
    for (const value of Object.values(node.props)) collectFrom(value, found)
  })

  /*
   * Settings last, and read directly rather than through the walk: they belong
   * to the document and not to any node, so no amount of tree walking reaches
   * them. They are the two references easiest to forget, which is why they are
   * named here rather than discovered.
   */
  const seoImage = document.settings.seo?.image

  if (seoImage !== undefined) found.add(seoImage.$asset)

  const favicon = document.settings.favicon

  if (favicon !== undefined) found.add(favicon.$asset)

  return found
}
