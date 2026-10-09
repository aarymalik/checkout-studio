import { defineProperties } from "@checkout-studio/plugin-sdk"

import * as common from "../common"

/**
 * docs/component-library.md § Heading: Text, Font, Size, Weight, Line Height,
 * Letter Spacing, Alignment, Gradient, Shadow, Animation.
 *
 * Nine of the ten. Animation is not a component property: a node's animations
 * live on the node itself — `node.animations` in the schema — and belong to the
 * engine's animation editor, which every component gets for free rather than
 * declaring. Listing it here would be a second place to set the same thing.
 *
 * Level is here although the catalog lists it separately as "Levels H1-H6". It
 * is the one property that changes what the element *is*, so it leads.
 */
export const headingProperties = defineProperties([
  common.level,
  common.text,
  common.fontFamily,
  common.fontSize,
  common.fontWeight,
  common.lineHeight,
  common.letterSpacing,
  common.textAlign,
  common.color,
  common.gradient,
  common.textShadow,
  common.margin,
])
