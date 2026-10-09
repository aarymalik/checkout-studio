import { defineProperties } from "@checkout-studio/plugin-sdk"

import * as common from "../common"

/**
 * docs/component-library.md § Text: "everything from Heading", plus lists,
 * links and rich formatting.
 *
 * Everything from Heading is here, minus the level — a paragraph has no place
 * in the outline — and minus the gradient, which is a thing for a title rather
 * than for body copy.
 *
 * Lists, links and rich formatting are not here. They need a representation for
 * inline marks, the schema has none, and what shape it takes decides what the
 * inline editor in Phase 12 can do. Deciding that from a property file would be
 * deciding it by accident.
 */
export const textProperties = defineProperties([
  common.text,
  common.fontFamily,
  common.fontSize,
  common.fontWeight,
  common.lineHeight,
  common.letterSpacing,
  common.textAlign,
  common.color,
  common.textShadow,
  common.margin,
])
