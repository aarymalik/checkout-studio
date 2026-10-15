"use client"

import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import { useEffect, useState } from "react"
import type { ReactElement } from "react"

import { deadlineText, instantOf, remainingAt } from "./time"

/**
 * Countdown.
 *
 * ## The clock is read, not counted
 *
 * Every tick recomputes from `Date.now()`. Nothing decrements, so a tab the
 * browser throttled, a laptop that slept, or a page left open over lunch all
 * come back showing the truth rather than however far behind they fell.
 *
 * The next tick is scheduled to land on the next whole second rather than one
 * second from now, so the digits change when the clock does instead of
 * drifting a few milliseconds further out of step every minute.
 *
 * ## Silence, on purpose
 *
 * The digits are `aria-hidden` and there is no live region. A countdown that
 * announced itself would interrupt a screen reader every second, which makes
 * the rest of the page unusable — so the deadline is given once, in words, in
 * the viewer's own timezone, and the ticking is left to the eyes.
 *
 * ## Why the digits are allowed to differ between server and client
 *
 * The server renders what was left when it rendered; by the time the browser
 * hydrates, less is. That is not a bug to reconcile — it is a clock — so the
 * digits carry `suppressHydrationWarning` rather than the component waiting
 * for JavaScript to show anything at all.
 */

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback
}

export function CountdownRenderer({ className, props }: ComponentRenderProps): ReactElement {
  const endsAt = instantOf(props["endsAt"])
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (endsAt === null || Date.now() >= endsAt) return

    let timer: ReturnType<typeof setTimeout>

    const schedule = (): void => {
      // To the next whole second, not a second from now.
      timer = setTimeout(
        () => {
          setNow(Date.now())

          if (Date.now() < endsAt) schedule()
        },
        1000 - (Date.now() % 1000),
      )
    }

    schedule()

    return () => {
      clearTimeout(timer)
    }
  }, [endsAt])

  if (endsAt === null) {
    /*
     * No deadline set, or one nobody can read. Nothing is drawn: a merchant
     * who has not chosen a date yet should not have a row of zeroes on their
     * page, and a customer should never see a countdown that counts nothing.
     */
    return <div className={className} data-ck-countdown-unset />
  }

  const left = remainingAt(endsAt, now)

  if (left.expired) {
    return (
      <div className={className}>
        <p className="ck-countdown-expired">
          {text(props["expiredMessage"], "This offer has ended.")}
        </p>
      </div>
    )
  }

  const parts = [
    { key: "days", value: left.days, label: text(props["labelDays"], "days") },
    { key: "hours", value: left.hours, label: text(props["labelHours"], "hours") },
    { key: "minutes", value: left.minutes, label: text(props["labelMinutes"], "minutes") },
    { key: "seconds", value: left.seconds, label: text(props["labelSeconds"], "seconds") },
    // A row starting "0 days" on an offer with four hours left is noise.
  ].filter((part) => part.key !== "days" || part.value > 0)

  return (
    <div className={className}>
      {text(props["label"], "") !== "" ? (
        <p className="ck-countdown-label">{text(props["label"], "")}</p>
      ) : null}

      <time dateTime={new Date(endsAt).toISOString()} className="ck-countdown-time">
        <span className="ck-countdown-said">
          {`${text(props["label"], "Ends")} ${deadlineText(endsAt)}`}
        </span>

        <span className="ck-countdown-parts" aria-hidden>
          {parts.map((part) => (
            <span key={part.key} className="ck-countdown-part" data-ck-countdown-part={part.key}>
              {/*
               * The suppression belongs on the element whose text differs, not
               * on an ancestor: React compares each text node against the
               * server's and `suppressHydrationWarning` covers only the
               * element it is written on. It was on the wrapper first, which
               * suppressed nothing and left a hydration warning on every page
               * carrying a clock.
               */}
              <span className="ck-countdown-value" suppressHydrationWarning>
                {part.key === "days" ? String(part.value) : String(part.value).padStart(2, "0")}
              </span>
              <span className="ck-countdown-unit">{part.label}</span>
            </span>
          ))}
        </span>
      </time>
    </div>
  )
}
