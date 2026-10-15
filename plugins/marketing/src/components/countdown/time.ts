/**
 * What is left, worked out from two instants.
 *
 * ## One instant, not a date and a timezone
 *
 * docs/component-library.md lists Target Date and Timezone as separate
 * editables. They are one field here, and the field is an absolute instant —
 * `2026-12-25T00:00:00-05:00` rather than "midnight" plus "New York".
 *
 * Two fields can disagree, and resolving a wall-clock time in a named zone
 * means asking a timezone database what the offset will be on a date that has
 * not happened yet — which changes when a government moves its clocks, and is
 * ambiguous twice a year for the hour that happens either no times or two. An
 * instant has none of those problems: it is the same moment for the merchant
 * who set it, the customer reading it in Tokyo, and the server that will stop
 * honouring the offer.
 *
 * What a merchant should *see* is a date picker with a zone beside it. That is
 * the inspector's job in Phase 12, and it writes one offset.
 *
 * ## Recomputed, never decremented
 *
 * `remainingAt` takes the clock as an argument and subtracts. Nothing counts
 * down by one: a counter that decrements every tick is wrong by however much
 * the browser was busy, and a tab left open over lunch comes back minutes out.
 */

export interface Remaining {
  expired: boolean
  days: number
  hours: number
  minutes: number
  seconds: number
}

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export const EXPIRED: Remaining = { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0 }

/**
 * The instant a target describes, or null when it describes none.
 *
 * A string without an offset is read as UTC, which is what `Date` does with an
 * ISO date-time it is given — stated here rather than left as a surprise.
 */
export function instantOf(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "") return null

  const parsed = Date.parse(value)

  return Number.isNaN(parsed) ? null : parsed
}

export function remainingAt(endsAt: number, now: number): Remaining {
  const left = endsAt - now

  if (left <= 0) return EXPIRED

  return {
    expired: false,
    days: Math.floor(left / DAY),
    hours: Math.floor((left % DAY) / HOUR),
    minutes: Math.floor((left % HOUR) / MINUTE),
    seconds: Math.floor((left % MINUTE) / SECOND),
  }
}

/**
 * The deadline in words, for somebody who cannot see the digits.
 *
 * Read in the viewer's own timezone, because that is the clock they will
 * judge "tomorrow at nine" against. The digits beside this tick every second
 * and are hidden from a screen reader — a live region counting down out loud
 * is unusable, and this is what it is replaced with.
 */
export function deadlineText(endsAt: number, locale = "en-GB"): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short" }).format(
      new Date(endsAt),
    )
  } catch {
    return new Date(endsAt).toISOString()
  }
}
