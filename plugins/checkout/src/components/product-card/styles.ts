import type { StyleProperties } from "@checkout-studio/schema"

/**
 * What a product looks like inside its card.
 *
 * A picture, then the words, then the price at the end of the line — which is
 * the shape of every order line anybody has read, and the reason the prices
 * push themselves to the end rather than sitting where the text stops.
 *
 * Every value is the theme's, so a card agrees with the page it is on.
 */
export const PRODUCT_STYLES: Readonly<Record<string, StyleProperties>> = {
  img: {
    width: "{spacing.10}",
    height: "{spacing.10}",
    // The picture fills its square whatever shape it was uploaded in. The
    // alternative is a card whose height depends on the merchant's camera.
    objectFit: "cover",
    borderRadius: "{radius.md}",
    flexShrink: "0",
  },

  ".ck-product-body": { flexGrow: "1", minWidth: "0" },

  /*
   * The title, whichever level the merchant chose. Listing all five keeps the
   * card's own type scale while leaving the document outline to them — a card
   * nested deeper should not also look smaller.
   */
  "h2, h3, h4, h5, h6": {
    margin: "0",
    fontSize: "{typography.scale.body.fontSize}",
    fontWeight: "{typography.scale.h4.fontWeight}",
    color: "{colors.foreground}",
  },

  ".ck-product-description": {
    margin: "{spacing.1} 0 0",
    fontSize: "{typography.scale.small.fontSize}",
    color: "{colors.foregroundMuted}",
  },

  ".ck-product-sku": {
    margin: "{spacing.1} 0 0",
    fontSize: "{typography.scale.caption.fontSize}",
    color: "{colors.foregroundMuted}",
  },

  /*
   * Stock is the one line on the card that exists to be noticed: it is drawn
   * only when something is nearly gone or already gone.
   */
  ".ck-product-stock": {
    margin: "{spacing.1} 0 0",
    fontSize: "{typography.scale.caption.fontSize}",
    fontWeight: "{typography.scale.h4.fontWeight}",
    color: "{colors.warning}",
  },

  ".ck-product-prices": {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: "{spacing.1}",
    margin: "0",
    flexShrink: "0",
    fontSize: "{typography.scale.body.fontSize}",
    color: "{colors.foreground}",
  },

  s: { color: "{colors.foregroundMuted}", fontSize: "{typography.scale.small.fontSize}" },

  ".ck-product-quantity": {
    fontSize: "{typography.scale.small.fontSize}",
    color: "{colors.foregroundMuted}",
  },

  /*
   * Read and not seen.
   *
   * Three of the numbers on a card are bare amounts, and a screen reader that
   * met them in a row would announce four figures with nothing to tell them
   * apart. `display: none` would hide them from it too, so the words are
   * placed outside the viewport instead of removed from the document.
   */
  ".ck-product-said": {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: "0",
    margin: "-1px",
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
    borderWidth: "0",
  },
}
