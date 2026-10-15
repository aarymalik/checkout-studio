import { trustIcon } from "../icons"

/**
 * What a merchant wrote, read as badges.
 *
 * Hand-written rather than schema-validated, for the reason the embed plugin
 * gives: this runs in a published page, and a validator here is bytes spent on
 * a published page to check something the editor already shaped. Anything that
 * is not a badge is skipped rather than thrown over — a page that stopped
 * rendering because one row of reassurance was malformed would lose the sale
 * the rest of it was trying to make.
 */

export interface Badge {
  paths: readonly string[]
  text: string
}

export function readBadges(value: unknown): readonly Badge[] {
  if (!Array.isArray(value)) return []

  const badges: Badge[] = []

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue

    const text = (entry as { text?: unknown }).text

    // The words are the badge. An icon with nothing beside it reassures
    // nobody and is announced as nothing at all.
    if (typeof text !== "string" || text.trim() === "") continue

    badges.push({ paths: trustIcon((entry as { icon?: unknown }).icon), text: text.trim() })
  }

  return badges
}
