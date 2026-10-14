import type { StyleProperties } from "@checkout-studio/schema"

/**
 * What a list does to the items inside it.
 *
 * The grid places them, so an `<li>` needs nothing but to stop being a bullet
 * and to let its card fill the track it was given.
 */
export const LIST_STYLES: Readonly<Record<string, StyleProperties>> = {
  li: { listStyle: "none", minWidth: "0" },
}
