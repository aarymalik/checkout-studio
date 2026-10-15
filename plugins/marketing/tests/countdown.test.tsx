import { act, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { countdown } from "../src/components/countdown/definition"
import { instantOf, remainingAt } from "../src/components/countdown/time"
import { expectNoViolations } from "./axe"
import { renderComponent } from "./support"

/** A fixed moment to measure everything against. */
const NOW = Date.parse("2026-12-24T12:00:00Z")

describe("reading a deadline", () => {
  it("reads an instant with an offset", () => {
    expect(instantOf("2026-12-25T00:00:00Z")).toBe(Date.parse("2026-12-25T00:00:00Z"))
  })

  it("reads the same instant written in two timezones as the same instant", () => {
    /*
     * The requirement in phases.md: counts down correctly across timezones.
     * Midnight in New York and five in the morning in London are one moment,
     * and a countdown that treated them as two would show different numbers to
     * two customers waiting for the same thing.
     */
    expect(instantOf("2026-12-25T00:00:00-05:00")).toBe(instantOf("2026-12-25T05:00:00Z"))
    expect(instantOf("2026-12-25T14:00:00+09:00")).toBe(instantOf("2026-12-25T05:00:00Z"))
  })

  it("is null for anything that is not a moment", () => {
    for (const value of [undefined, "", "   ", "next Tuesday", 42, {}]) {
      expect(instantOf(value)).toBeNull()
    }
  })
})

describe("what is left", () => {
  it("breaks the gap into days, hours, minutes and seconds", () => {
    const endsAt = NOW + ((2 * 24 + 3) * 60 + 4) * 60_000 + 5_000

    expect(remainingAt(endsAt, NOW)).toEqual({
      expired: false,
      days: 2,
      hours: 3,
      minutes: 4,
      seconds: 5,
    })
  })

  it("is expired at the moment itself, not a second after", () => {
    expect(remainingAt(NOW, NOW).expired).toBe(true)
    expect(remainingAt(NOW - 1, NOW).expired).toBe(true)
    expect(remainingAt(NOW + 1000, NOW).expired).toBe(false)
  })
})

describe("a countdown on a page", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function at(endsAt: string, props: Record<string, unknown> = {}): void {
    renderComponent(countdown, { props: { ...countdown.defaultProps, endsAt, ...props } })
  }

  /*
   * Inside `act`, because the tick is a bare `setTimeout` rather than anything
   * React scheduled: advancing the clock runs the callback, the callback sets
   * state, and without this React has not re-rendered by the time the
   * assertion reads the DOM. The first version of these tests advanced the
   * timers and asserted against the previous second.
   */
  /** One part of the clock, by name — "00" is ambiguous twice over. */
  function part(name: string): string {
    const found = document.querySelector(`[data-ck-countdown-part="${name}"] .ck-countdown-value`)

    return found?.textContent ?? ""
  }

  function tick(ms: number): void {
    act(() => {
      vi.advanceTimersByTime(ms)
    })
  }

  it("shows what is left", () => {
    at("2026-12-24T14:30:45Z")

    expect(part("hours")).toBe("02")
    expect(part("minutes")).toBe("30")
    expect(part("seconds")).toBe("45")
  })

  it("leaves the days out when there are none", () => {
    // A row starting "0 days" on an offer with four hours left is noise.
    at("2026-12-24T16:00:00Z")

    expect(document.querySelector('[data-ck-countdown-part="days"]')).toBeNull()
    expect(document.querySelector('[data-ck-countdown-part="hours"]')).not.toBeNull()
  })

  it("counts down a second at a time", () => {
    at("2026-12-24T12:01:00Z")

    expect(part("minutes")).toBe("01")
    expect(part("seconds")).toBe("00")

    tick(1000)

    expect(part("minutes")).toBe("00")
    expect(part("seconds")).toBe("59")
  })

  it("does not drift over a long run", () => {
    /*
     * Every tick recomputes from the clock rather than subtracting one. After
     * an hour of ticks a counter that decremented would be out by however many
     * the browser skipped; this is out by none, because it never counted.
     */
    at("2026-12-25T12:00:00Z")

    tick(60 * 60 * 1000)

    const parts = [...document.querySelectorAll("[data-ck-countdown-part]")].map((part) =>
      part.getAttribute("data-ck-countdown-part"),
    )

    expect(parts).toEqual(["hours", "minutes", "seconds"])
    expect(part("hours")).toBe("23")
    expect(part("minutes")).toBe("00")
    expect(part("seconds")).toBe("00")
  })

  it("stops its timer when it is taken off the page", () => {
    /*
     * A countdown that kept ticking after its page had gone would set state on
     * something React had thrown away, every second, for as long as the tab
     * was open.
     */
    const { unmount } = renderComponent(countdown, {
      props: { ...countdown.defaultProps, endsAt: "2026-12-25T12:00:00Z" },
    })

    expect(vi.getTimerCount()).toBe(1)

    unmount()

    expect(vi.getTimerCount()).toBe(0)
  })

  it("says the offer has ended once it has", () => {
    at("2026-12-24T11:59:59Z")

    expect(screen.getByText("This offer has ended.")).toBeVisible()
    expect(document.querySelector("[data-ck-countdown-part]")).toBeNull()
  })

  it("takes the merchant's words for the end", () => {
    at("2020-01-01T00:00:00Z", { expiredMessage: "Sold out." })

    expect(screen.getByText("Sold out.")).toBeVisible()
  })

  it("stops counting when it reaches the end", () => {
    at("2026-12-24T12:00:03Z")

    tick(5000)

    expect(screen.getByText("This offer has ended.")).toBeVisible()
  })

  it("draws nothing at all without a deadline", () => {
    // A merchant who has not chosen a date should not have a row of zeroes on
    // their page, and a customer should never see a clock counting nothing.
    renderComponent(countdown)

    expect(document.querySelector("[data-ck-countdown-unset]")).not.toBeNull()
    expect(document.querySelector("time")).toBeNull()
  })

  it("takes the merchant's labels", () => {
    at("2026-12-25T12:00:00Z", { labelHours: "hrs", labelMinutes: "min", labelSeconds: "sec" })

    expect(screen.getByText("hrs")).toBeVisible()
    expect(screen.getByText("min")).toBeVisible()
    expect(screen.getByText("sec")).toBeVisible()
  })
})

describe("what a screen reader is told", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("hides the ticking digits and gives the deadline once, in words", () => {
    /*
     * A live region counting down out loud interrupts every second and makes
     * the rest of the page unusable. The digits are for the eyes; the deadline
     * is said once.
     */
    const { container } = renderComponent(countdown, {
      props: { ...countdown.defaultProps, endsAt: "2026-12-25T00:00:00Z" },
    })

    expect(container.querySelector(".ck-countdown-parts")).toHaveAttribute("aria-hidden")
    expect(container.querySelector("[aria-live]")).toBeNull()
    expect(container.querySelector(".ck-countdown-said")?.textContent).toMatch(/December/)
  })

  it("carries the deadline as a machine-readable time", () => {
    const { container } = renderComponent(countdown, {
      props: { ...countdown.defaultProps, endsAt: "2026-12-25T00:00:00-05:00" },
    })

    expect(container.querySelector("time")).toHaveAttribute("datetime", "2026-12-25T05:00:00.000Z")
  })
})

describe("axe", () => {
  it("reports nothing for a running countdown", async () => {
    // Real timers: axe schedules its own work, and a faked clock leaves it
    // waiting for a tick that never comes.
    const { container } = renderComponent(countdown, {
      props: { ...countdown.defaultProps, endsAt: "2099-12-25T00:00:00Z" },
    })

    await expectNoViolations(container)
  })
})
