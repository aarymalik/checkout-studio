import { z } from "zod"
import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { ContainerRenderer } from "./Renderer"

/**
 * Container's registration.
 *
 * ## Why this one has a theme slot
 *
 * A container's job is a maximum width, and the right maximum is a decision
 * about the whole brand rather than about one container: 1120px here and 960px
 * on the next page is not a choice anybody made, it is two people guessing. So
 * the number lives in the theme, where one edit moves every container on every
 * page.
 *
 * That is what `themeSlot` is for — stage 1 of the six-stage cascade — and this
 * is its first real use. `defaults` apply to a theme that has never heard of
 * this component, which is every theme today, so the value below is the shipped
 * one until somebody changes it.
 *
 * It is also the honest answer to "where does 1120px live". A literal in
 * `defaultStyles` would be a number outliving the decision that produced it,
 * and there is no spacing token for a content width — that scale tops out at 96.
 */
export const container: ComponentDefinition = {
  type: "core.container",
  name: "Container",
  category: "Layout",
  interactive: false,
  container: true,
  defaultProps: {},
  defaultStyles: {
    width: "100%",
    /*
     * Centred by its own margins rather than by the parent's alignment, so a
     * container is centred wherever it is put. One that only centres inside a
     * flex parent is one that moves when somebody changes the parent.
     */
    marginLeft: "auto",
    marginRight: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "{spacing.5}",
    paddingLeft: "{spacing.5}",
    paddingRight: "{spacing.5}",
    alignItems: "stretch",
  },
  renderer: ContainerRenderer,
  themeSlot: {
    label: "Container",
    schema: z.object({ maxWidth: z.string().min(1) }),
    defaults: { maxWidth: "1120px" },
    toStyles: (slot) => ({ maxWidth: String(slot["maxWidth"]) }),
  },
}
