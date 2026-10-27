import type { ThemeColors } from "@checkout-studio/schema"

/**
 * The semantic colours, named once.
 *
 * Shared by the Colors section and the Dark mode section, which edit the same
 * thirteen tokens at two different times: Colors writes the light value and
 * Dark mode writes the sparse override above it. They are the same list in the
 * same order with the same labels on purpose — a person who has just set a
 * surface colour and then opens Dark mode should find that surface in the same
 * place, and two copies of this list would eventually disagree about either
 * the order or a name.
 *
 * `custom` is not here. It is an open record a person names themselves, so it
 * has no fixed list and no label anyone could write in advance.
 */
export const SEMANTIC = [
  "background",
  "surface",
  "surfaceRaised",
  "foreground",
  "foregroundMuted",
  "border",
  "borderStrong",
  "primary",
  "primaryForeground",
  "success",
  "warning",
  "danger",
  "focusRing",
] as const satisfies readonly (keyof Omit<ThemeColors, "custom">)[]

export type SemanticColor = (typeof SEMANTIC)[number]

export const LABEL: Record<SemanticColor, string> = {
  background: "Background",
  surface: "Surface",
  surfaceRaised: "Raised surface",
  foreground: "Text",
  foregroundMuted: "Muted text",
  border: "Border",
  borderStrong: "Strong border",
  primary: "Brand",
  primaryForeground: "Label on brand",
  success: "Success",
  warning: "Warning",
  danger: "Danger",
  focusRing: "Focus ring",
}
