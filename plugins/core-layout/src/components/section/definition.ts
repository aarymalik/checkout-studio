import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { SectionRenderer } from "./Renderer"

/**
 * Section's registration.
 *
 * The reference for every component in this plugin, per docs/phases.md Phase 9
 * step 1. Three files, always: this one says what the engine knows, `Renderer`
 * says what the browser gets, and `properties` says what the inspector offers.
 * No component ships an inspector panel.
 *
 * ## Why the defaults are styles and not props
 *
 * Everything docs/component-library.md lists as editable on a Section — width,
 * max width, background, padding, margin, border, radius, shadow, overflow — is
 * a CSS property, so all of it lives in `defaultStyles` and travels through the
 * six-stage cascade. That is not a detail of where to put things: only a style
 * can be overridden per breakpoint and per state, which is what makes
 * "Supports: Responsive" true without Section doing anything.
 *
 * The one prop is the background image, and it is a prop because it has to be.
 * A node's styles hold strings, numbers, booleans and null; an asset reference
 * is an object. See `background.ts`.
 */
export const section: ComponentDefinition = {
  type: "core.section",
  name: "Section",
  category: "Layout",
  /** Renders on the server and hydrates nothing. */
  interactive: false,
  container: true,
  defaultProps: {},
  defaultStyles: {
    width: "100%",
    /*
     * Token references, not literals.
     *
     * `{spacing.9}` compiles to `var(--ck-space-9)`, so a theme that changes
     * its spacing scale moves every section on every page without any document
     * being rewritten. A literal `48px` here would be a number that outlives
     * the decision that produced it.
     */
    paddingTop: "{spacing.9}",
    paddingBottom: "{spacing.9}",
    paddingLeft: "{spacing.5}",
    paddingRight: "{spacing.5}",
    maxWidth: "none",
    overflow: "visible",
  },
  renderer: SectionRenderer,
}
