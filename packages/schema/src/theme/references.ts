import type { CheckoutSchema } from "../document/schema"
import { traverse } from "../tree/traverse"
import { tokenPath } from "./validate"

/**
 * Every theme token a document refers to.
 *
 * The mirror of `assetReferences`, and for the same reason: two ends of one
 * question. Exporting a page has to declare what the page depends on, and a
 * page whose heading is `{colors.custom.mint}` depends on a theme that defines
 * mint — a dependency nothing can see by looking at the theme, because the
 * theme does not know who reads it.
 *
 * ## Styles, not props
 *
 * Exactly the inverse of where an asset can hide, and for the same structural
 * reason. A token reference is a *string* — `{colors.primary}` — and the
 * inspector writes one through a style target; an asset reference is an
 * object, which a style value cannot be. So assets live in props and tokens
 * live in styles, and each walk looks in one place and says why.
 *
 * ## Paths, not values
 *
 * What comes back is `colors.primary`, not the colour. Whether a path resolves
 * is answered where the theme is flat and complete — see theme/validate.ts.
 * A document that names a token the theme has dropped is a real situation, and
 * this is the walk that lets an import notice it rather than render a blank.
 */
export function tokenReferences(document: CheckoutSchema): ReadonlySet<string> {
  const found = new Set<string>()

  traverse(document, ({ node }) => {
    for (const states of Object.values(node.styles)) {
      for (const properties of Object.values(states)) {
        for (const value of Object.values(properties)) {
          if (typeof value !== "string") continue

          const path = tokenPath(value)

          if (path !== null) found.add(path)
        }
      }
    }
  })

  return found
}
