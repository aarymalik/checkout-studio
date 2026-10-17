import type { StyleProperties } from "@checkout-studio/schema"

/**
 * A grid of pictures that are not the point of the page.
 *
 * Muted by default and full colour under the pointer, which is the convention
 * these walls follow: six brands at full strength beside a payment form
 * compete with it for attention they do not deserve.
 */
export const LOGO_STYLES: Readonly<Record<string, StyleProperties>> = {
  li: { display: "flex", alignItems: "center", justifyContent: "center", listStyle: "none" },

  img: {
    maxWidth: "100%",
    height: "{spacing.6}",
    objectFit: "contain",
    filter: "grayscale(1)",
    opacity: "0.7",
    transitionProperty: "filter, opacity",
    transitionDuration: "{motion.durationFast}",
    transitionTimingFunction: "{motion.easing}",
  },

  "img:hover": { filter: "grayscale(0)", opacity: "1" },
}
