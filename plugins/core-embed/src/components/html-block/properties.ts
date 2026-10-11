import { defineProperties } from "@checkout-studio/plugin-sdk"

/**
 * docs/component-library.md § HTML Block: HTML, CSS classes, attributes.
 *
 * One property, because the other two are not properties — a class and an
 * attribute are written in the markup itself, and the catalog is listing what
 * the markup may contain rather than what the inspector shows.
 *
 * `markup` rather than `text`: the control edits HTML and the prop holds the
 * tree that survived the allowlist, and that conversion is the control's. See
 * the kind's note in plugin-sdk.
 */
export const htmlBlockProperties = defineProperties([
  {
    key: "content",
    target: "prop",
    label: "HTML",
    group: "General",
    control: "markup",
    help: "Scripts, styles, frames and form fields are removed. The editor lists what it took out.",
  },
])
