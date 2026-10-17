/**
 * The logos a merchant uploaded.
 *
 * Every one needs a name. A wall of pictures with nothing to call them is a
 * row of "image" announcements to a screen reader, which is worse than no wall
 * at all — so a logo without a label is skipped rather than drawn.
 */

export interface Logo {
  src: string
  label: string
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

export function readLogos(value: unknown): readonly Logo[] {
  if (!Array.isArray(value)) return []

  const logos: Logo[] = []

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue

    const src = text((entry as { src?: unknown }).src)
    const label = text((entry as { label?: unknown }).label)

    if (src === "" || label === "") continue

    logos.push({ src, label })
  }

  return logos
}
