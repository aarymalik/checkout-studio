import { defineProperties } from "@checkout-studio/plugin-sdk"

import * as common from "../common"

/**
 * docs/component-library.md § Container: Width, Max Width, Padding, Alignment,
 * Gap.
 *
 * Max width is here as well as in the theme slot, and both belong. The theme
 * says what a container is normally; this overrides it for the one that is not
 * — a full-bleed hero inside an otherwise 1120px page. Stage 3 beats stage 1,
 * which is the cascade working rather than two settings fighting.
 */
export const containerProperties = defineProperties([
  common.width,
  common.maxWidth,
  common.padding,
  common.alignItems,
  common.gap,
])
