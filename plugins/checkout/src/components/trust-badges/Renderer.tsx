import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

import { readBadges } from "./badges"

/**
 * Trust Badges.
 *
 * ## It ships no JavaScript
 *
 * Nothing here reads a quote or remembers anything. It is words and shapes the
 * merchant chose, so it renders on the server and hydrates nothing — which is
 * the right answer for a row whose whole job is to be there when the page
 * arrives.
 *
 * ## The icons are decoration and say so
 *
 * Every badge carries its own words, so the glyph beside them is `aria-hidden`
 * and a screen reader hears "Secure checkout" once rather than "image, secure
 * checkout". An icon that repeats the text next to it is noise read aloud.
 *
 * ## A list, because it is one
 *
 * Three unrelated reassurances in a row are a list, and announcing "list,
 * three items" before reading them is the difference between hearing a set and
 * hearing a sentence that does not parse.
 */
export function TrustBadgesRenderer({ className, props }: ComponentRenderProps): ReactElement {
  const badges = readBadges(props["badges"])

  if (badges.length === 0) return <ul className={className} />

  return (
    <ul className={className}>
      {badges.map((badge) => (
        <li key={badge.text}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            {badge.paths.map((path) => (
              <path key={path} d={path} />
            ))}
          </svg>
          <span>{badge.text}</span>
        </li>
      ))}
    </ul>
  )
}
