import { defineProperties } from "@checkout-studio/plugin-sdk"

import * as common from "../common"

/**
 * What the inspector offers for a Section.
 *
 * Data, not UI. Phase 12 generates the panel from this; nothing here knows what
 * a control looks like, and this file imports no React. It is also validated at
 * module scope — `defineProperties` parses — so a property that could not be
 * drawn is a failure in this plugin at import time rather than half a panel in
 * front of a user.
 *
 * The list is docs/component-library.md § Section, in that order. Every entry
 * but the background image is a style and so can be responsive, which is how
 * "Supports: Responsive" is delivered rather than claimed.
 */
export const sectionProperties = defineProperties([
  common.width,
  common.maxWidth,
  common.backgroundColor,
  common.backgroundImage,
  common.padding,
  common.margin,
  common.border,
  common.borderRadius,
  common.boxShadow,
  common.overflow,
])
