import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { hasNoText } from "../text"
import { ButtonRenderer } from "./Renderer"

/**
 * Button's registration.
 *
 * ## `interactive: false`, which surprised me
 *
 * The flag means "this ships JavaScript to a published page". A button that
 * navigates is an anchor; one that does not is a `<button type="button">`;
 * disabled and loading are attributes; the spinner is CSS; and the analytics
 * event is a data attribute a delegated listener will read. None of that is
 * JavaScript this component puts on the page.
 *
 * I said these would be the first components to move the bundle. They are not,
 * and that is the right outcome rather than a missed one — the first component
 * that genuinely needs a client is the payment element in Phase 13.
 *
 * ## Hover and Pressed are not properties
 *
 * The catalog lists them as editable, and they are — as the state layer every
 * style already has. The document stores `hover`, `focus`, `active` and
 * `disabled` overrides per style, which is stage 5 of the cascade, so a button
 * gets them by marking its style properties `states: true` rather than by
 * growing four more controls. See docs/theme-system.md § Style Resolution.
 */
export const button: ComponentDefinition = {
  type: "core.button",
  name: "Button",
  category: "Navigation",
  interactive: false,
  container: false,
  defaultProps: { text: "Continue", disabled: false, loading: false },
  defaultStyles: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "{spacing.2}",
    paddingTop: "{spacing.3}",
    paddingBottom: "{spacing.3}",
    paddingLeft: "{spacing.5}",
    paddingRight: "{spacing.5}",
    backgroundColor: "{colors.primary}",
    color: "{colors.primaryForeground}",
    borderRadius: "{radius.md}",
    fontFamily: "{typography.fontFamily.body}",
    fontSize: "{typography.scale.body.fontSize}",
    fontWeight: 600,
    lineHeight: "{typography.scale.body.lineHeight}",
    textDecoration: "none",
    // A button sits where it is put rather than stretching to fill the flex
    // column every layout component in this product is.
    alignSelf: "flex-start",
    cursor: "pointer",
  },
  renderer: ButtonRenderer,
  /*
   * A button with no words is a button nobody can use and nobody can hear.
   * Not "missing target", which the catalog's test list names: a button with
   * no destination is ordinary today, because the actions that give it one
   * arrive with the form system in Phase 10 — and a rule that fires on every
   * button on every page is a rule people learn to scroll past.
   */
  validate: (node) => (hasNoText(node) ? "This button has no label." : null),
}
