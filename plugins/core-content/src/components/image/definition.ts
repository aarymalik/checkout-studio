import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { ImageRenderer, assetOf } from "./Renderer"

/**
 * Image's registration.
 *
 * Two rules, and the second is the one Phase 9's accessibility criteria ask
 * for by name — "image requires alt; decorative images use `alt=\"\"`".
 *
 * A missing source is an error because the component renders nothing without
 * one: a node on the page that is not on the page.
 *
 * A missing description is an error unless the author has said the image is
 * decorative. Those are different claims — "I have not written this yet" and
 * "there is nothing here worth saying" — and only the author knows which. A
 * component that guessed would either nag about a divider line or let a
 * product photo through unlabelled.
 */
export const image: ComponentDefinition = {
  type: "core.image",
  name: "Image",
  category: "Media",
  interactive: false,
  container: false,
  defaultProps: { alt: "", decorative: false, eager: false },
  defaultStyles: {
    display: "block",
    maxWidth: "100%",
    // Without it a width set on the element and a height from the asset fight,
    // and the image is stretched rather than scaled.
    height: "auto",
    objectFit: "cover",
    borderRadius: "{radius.none}",
  },
  renderer: ImageRenderer,
  validate: (node) => {
    if (assetOf(node.props["src"]) === null) return "This image has no source."

    if (node.props["decorative"] === true) return null

    const alt = node.props["alt"]

    return typeof alt === "string" && alt.trim() !== ""
      ? null
      : "This image has no description. Add one, or mark it decorative if it says nothing the text does not."
  },
}
