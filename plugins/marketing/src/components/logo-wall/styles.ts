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

/*
 * Known limitation: a dark logo on a dark theme.
 *
 * These are the merchant's pictures, and a dark wordmark muted to 70% all but
 * disappears on a dark background — the screenshots show it. The usual answer
 * is to invert them for that colour mode, and this plugin cannot: descendant
 * styles are a flat map of selectors, with no way to say "when the page is
 * dark". The engine emits dark values by re-declaring tokens under an
 * attribute selector on the root, which a component's own rules cannot reach.
 *
 * So for now a merchant with a dark theme supplies logos that read on it. Two
 * ways out, neither of them this slice's: a colour-mode variant in
 * `descendantStyles`, or a token whose value differs by mode that a filter can
 * read. Recorded in docs/component-library.md.
 */
