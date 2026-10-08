import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { PageRenderer } from "./Renderer"

/**
 * The page root's registration.
 *
 * `core.page` is `ROOT_TYPE` in packages/schema: every document created by this
 * product has a root node of this type, and the renderer renders the root as an
 * ordinary node. So before this existed, every page in the product — canvas and
 * published alike — resolved its root to the unsupported fallback. The engine
 * was shipping a document type no component answered to.
 *
 * It is not in the catalog's plugin table either, which is a gap this slice
 * fills; see docs/component-library.md.
 *
 * `insertable: false`, because a page is not something a user adds. Without it
 * the library panel would list Page under Layout as something to drag onto the
 * page it is already inside.
 */
export const page: ComponentDefinition = {
  type: "core.page",
  name: "Page",
  category: "Layout",
  interactive: false,
  container: true,
  insertable: false,
  defaultProps: {},
  defaultStyles: {
    /*
     * The page is a column, and the full height of whatever holds it.
     *
     * A checkout that is shorter than the viewport should still paint its
     * background to the bottom of the window rather than ending in the
     * browser's default white halfway down.
     */
    display: "flex",
    flexDirection: "column",
    minHeight: "100%",
    width: "100%",
    backgroundColor: "{colors.background}",
    color: "{colors.foreground}",
    fontFamily: "{typography.fontFamily.body}",
  },
  renderer: PageRenderer,
}
