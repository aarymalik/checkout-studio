/**
 * Font stacks, and the families a theme can ask for without a network request.
 *
 * ## Why this is here and not in the design system
 *
 * These are the checkout's fonts, not the Studio's. defaults.ts is the one file
 * allowed to hold raw values, "because this is where the vocabulary is
 * defined" — and a fallback stack is vocabulary. It was declared there until
 * the Theme panel needed to offer the same stacks it had already chosen for the
 * default theme; duplicating them would have been two lists drifting.
 *
 * ## Why only system families
 *
 * `FontDefinition.source` has three values and one of them works today. A
 * Google family is meant to be fetched into our own asset storage and served
 * from our origin, which the Content Security Policy requires; until the asset
 * pipeline has ingested it there is no file to serve, and the renderer says so
 * in as many words — `planFonts` raises `not-self-hosted` and falls back to the
 * stack. A custom family needs an `assetId`, which is the same pipeline.
 *
 * So a picker offering either would write a theme whose font silently never
 * loads. These are the families that need no file: the browser either has them
 * or walks the stack, and both outcomes are the one the theme asked for.
 */

/** Metric-matched where it can be, newest first, generic last. */
export const SANS_STACK = [
  "ui-sans-serif",
  "system-ui",
  "-apple-system",
  "Segoe UI",
  "Roboto",
  "Helvetica Neue",
  "Arial",
  "sans-serif",
]

export const SERIF_STACK = [
  "ui-serif",
  "Iowan Old Style",
  "Palatino",
  "Times New Roman",
  "Georgia",
  "serif",
]

export const MONO_STACK = [
  "ui-monospace",
  "SFMono-Regular",
  "Menlo",
  "Consolas",
  "Liberation Mono",
  "monospace",
]

/** A family a theme may name without anything having to be fetched for it. */
export interface SystemFamily {
  family: string
  /** What the browser falls back through when it does not have the family. */
  fallback: readonly string[]
  /** Shown in the Theme panel. */
  label: string
}

/**
 * The offerable families.
 *
 * Short on purpose. A checkout needs a voice, not a catalogue, and every
 * entry here is a family a browser either has or can substitute without a
 * visible shift. Inter leads because it is what the default theme names.
 */
export const SYSTEM_FAMILIES: readonly SystemFamily[] = [
  { family: "Inter", fallback: SANS_STACK, label: "Inter" },
  { family: "system-ui", fallback: SANS_STACK, label: "System sans" },
  { family: "Helvetica Neue", fallback: SANS_STACK, label: "Helvetica" },
  { family: "Georgia", fallback: SERIF_STACK, label: "Georgia" },
  { family: "ui-serif", fallback: SERIF_STACK, label: "System serif" },
  { family: "JetBrains Mono", fallback: MONO_STACK, label: "JetBrains Mono" },
  { family: "ui-monospace", fallback: MONO_STACK, label: "System mono" },
]
