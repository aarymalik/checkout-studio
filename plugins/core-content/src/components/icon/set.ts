/**
 * The icons a checkout can draw.
 *
 * ## Why a short list rather than a library
 *
 * The catalog says Lucide, Heroicons and custom SVG. An icon component whose
 * name is a prop cannot be tree-shaken — the bundler cannot know which of a
 * thousand icons a document will ask for, so it ships all of them. Lucide
 * alone is over a thousand icons, on a page whose entire first-party budget is
 * 60 KB and whose job is to take a payment.
 *
 * So these are inline paths, chosen for what a checkout actually says: that
 * something is secure, that it is guaranteed, that it is on its way, that a
 * step is done. Each is 24×24 on Lucide's grid and drawn with the same stroke
 * conventions, so they sit together and a future import from Lucide would not
 * look out of place.
 *
 * Adding one is a line here and a reviewed decision about the bytes. Custom
 * SVG upload needs asset handling and a sanitiser, and is Phase 14's — see
 * docs/component-library.md.
 */

export interface IconShape {
  /** What it is for, in the author's words. */
  label: string
  /** `d` attributes, drawn in order, stroked rather than filled. */
  paths: readonly string[]
}

export const ICONS = {
  check: { label: "Check", paths: ["M20 6 9 17l-5-5"] },
  lock: {
    label: "Lock",
    paths: [
      "M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z",
      "M8 11V7a4 4 0 0 1 8 0v4",
    ],
  },
  shield: { label: "Shield", paths: ["M12 3 5 6v6c0 4 3 7.5 7 9 4-1.5 7-5 7-9V6l-7-3Z"] },
  truck: {
    label: "Delivery",
    paths: [
      "M3 7h11v9H3zM14 10h4l3 3v3h-7z",
      "M7.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
      "M17.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
    ],
  },
  card: { label: "Card", paths: ["M3 6h18v12H3zM3 10h18"] },
  star: {
    label: "Star",
    paths: ["m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z"],
  },
  info: {
    label: "Information",
    paths: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 16v-5", "M12 8h.01"],
  },
  arrowRight: { label: "Arrow", paths: ["M5 12h14", "m13 6 6 6-6 6"] },
} as const satisfies Record<string, IconShape>

export type IconName = keyof typeof ICONS

export const ICON_NAMES = Object.keys(ICONS) as readonly IconName[]

/** The icon a node asks for, or the fallback. A document can hold anything. */
export function iconOf(value: unknown): IconShape {
  return typeof value === "string" && value in ICONS ? ICONS[value as IconName] : ICONS.check
}
