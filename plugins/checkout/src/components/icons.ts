/**
 * The glyphs the trust components draw.
 *
 * ## Why this plugin has its own
 *
 * `core-content` has an icon set, and this is not it. A plugin may reach the
 * layers below it and never another plugin — they are independent, so that a
 * product built on this engine can ship one without the other. Five path
 * strings is what that independence costs here, and it is the right side of
 * the trade: the alternative is a cross-cutting package invented in the middle
 * of a feature, or a dependency that stops either plugin being removable.
 *
 * If a third plugin wants the same glyphs, that is the moment to promote them
 * to a shared layer rather than copy them again.
 *
 * ## Why a short list rather than a library
 *
 * The same reason `core-content` gives: an icon component whose name is a prop
 * cannot be tree-shaken, so a thousand-icon library ships entire on a page
 * whose whole first-party budget is 60 KB. These are the things a checkout
 * says — it is secure, it is guaranteed, it is on its way, it is done, it
 * takes your card.
 *
 * 24×24 on Lucide's grid, stroked rather than filled, so they sit beside
 * `core-content`'s without looking imported from somewhere else.
 */

export const TRUST_ICONS = {
  lock: [
    "M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z",
    "M8 11V7a4 4 0 0 1 8 0v4",
  ],
  shield: ["M12 3 5 6v6c0 4 3 7.5 7 9 4-1.5 7-5 7-9V6l-7-3Z"],
  truck: [
    "M3 7h11v9H3zM14 10h4l3 3v3h-7z",
    "M7.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
    "M17.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
  ],
  check: ["M20 6 9 17l-5-5"],
  card: ["M3 6h18v12H3zM3 10h18"],
} as const satisfies Record<string, readonly string[]>

export type TrustIconName = keyof typeof TRUST_ICONS

export const TRUST_ICON_NAMES = Object.keys(TRUST_ICONS) as readonly TrustIconName[]

/** The named icon, or the one that means "this is fine". */
export function trustIcon(value: unknown): readonly string[] {
  return typeof value === "string" && value in TRUST_ICONS
    ? TRUST_ICONS[value as TrustIconName]
    : TRUST_ICONS.check
}
