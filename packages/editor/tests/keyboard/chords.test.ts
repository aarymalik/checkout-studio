import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  CHORD_LEADER,
  CHORD_TIMEOUT_MS,
  ChordBuffer,
  type ChordContinuation,
  type ChordOutcome,
} from "../../src/keyboard/chords"

const publish: ChordContinuation = {
  sequence: "alt+KeyK KeyP",
  stroke: { key: "KeyP" },
  commandId: "publish.publish",
}

const snapshot: ChordContinuation = {
  sequence: "alt+KeyK KeyS",
  stroke: { key: "KeyS" },
  commandId: "file.snapshot",
}

describe("the chord leader", () => {
  // ⌘K opens the palette immediately, and the palette's overlay scope is
  // exclusive — the second stroke would be typed into its search box.
  it("is ⌥K, not ⌘K", () => {
    expect(CHORD_LEADER).toEqual({ key: "KeyK", alt: true })
  })

  it("waits two seconds, which is long enough to think and short enough to forget", () => {
    expect(CHORD_TIMEOUT_MS).toBe(2_000)
  })
})

describe("ChordBuffer", () => {
  let buffer: ChordBuffer
  let outcomes: ChordOutcome[]

  beforeEach(() => {
    vi.useFakeTimers()
    buffer = new ChordBuffer({ timeoutMs: 1_000 })
    outcomes = []
    buffer.subscribe((outcome) => outcomes.push(outcome))
  })

  afterEach(() => {
    buffer.dispose()
    vi.useRealTimers()
  })

  it("starts closed", () => {
    expect(buffer.isOpen).toBe(false)
    expect(buffer.pending).toEqual([])
  })

  it("opens on the leader and publishes its continuations", () => {
    buffer.open(CHORD_LEADER, [publish, snapshot])

    expect(buffer.isOpen).toBe(true)
    expect(buffer.pending).toEqual([publish, snapshot])
    expect(outcomes).toEqual([{ type: "open", continuations: [publish, snapshot] }])
  })

  it("resolves a matching second stroke", () => {
    buffer.open(CHORD_LEADER, [publish, snapshot])

    const outcome = buffer.feed({ key: "KeyP" })

    expect(outcome).toEqual({
      type: "resolved",
      sequence: "alt+KeyK KeyP",
      commandId: "publish.publish",
    })
    expect(buffer.isOpen).toBe(false)
  })

  // An unmatched stroke is discarded, never passed through: somebody mid-chord
  // did not mean to type a letter, and acting on it is worse than doing nothing.
  it("cancels on an unmatched second stroke", () => {
    buffer.open(CHORD_LEADER, [publish])

    expect(buffer.feed({ key: "KeyZ" })).toEqual({ type: "cancelled", reason: "unmatched" })
    expect(buffer.isOpen).toBe(false)
  })

  it("cancels on Escape", () => {
    buffer.open(CHORD_LEADER, [publish])

    expect(buffer.feed({ key: "Escape" })).toEqual({ type: "cancelled", reason: "escape" })
  })

  it("times out", () => {
    buffer.open(CHORD_LEADER, [publish])

    vi.advanceTimersByTime(999)
    expect(buffer.isOpen).toBe(true)

    vi.advanceTimersByTime(1)

    expect(buffer.isOpen).toBe(false)
    expect(outcomes.at(-1)).toEqual({ type: "cancelled", reason: "timeout" })
  })

  it("does not time out after resolving", () => {
    buffer.open(CHORD_LEADER, [publish])
    buffer.feed({ key: "KeyP" })

    vi.advanceTimersByTime(5_000)

    expect(outcomes.filter((outcome) => outcome.type === "cancelled")).toEqual([])
  })

  it("defaults to the documented timeout when none is given", () => {
    const standard = new ChordBuffer()
    const seen: ChordOutcome[] = []
    standard.subscribe((outcome) => seen.push(outcome))
    standard.open(CHORD_LEADER, [publish])

    vi.advanceTimersByTime(CHORD_TIMEOUT_MS - 1)
    expect(standard.isOpen).toBe(true)

    vi.advanceTimersByTime(1)
    expect(standard.isOpen).toBe(false)

    standard.dispose()
  })

  // A leader pressed twice means the person started again, not that chords nest.
  it("restarts rather than nesting when the leader is pressed again", () => {
    buffer.open(CHORD_LEADER, [publish])
    vi.advanceTimersByTime(900)
    buffer.open(CHORD_LEADER, [snapshot])

    vi.advanceTimersByTime(900)

    expect(buffer.isOpen).toBe(true)
    expect(buffer.pending).toEqual([snapshot])
  })

  it("ignores a stroke while closed, so the dispatcher treats it as ordinary", () => {
    expect(buffer.feed({ key: "KeyP" })).toBeNull()
  })

  describe("cancel", () => {
    it("abandons an open buffer, as leaving the window does", () => {
      buffer.open(CHORD_LEADER, [publish])

      expect(buffer.cancel()).toEqual({ type: "cancelled", reason: "escape" })
    })

    it("does nothing when nothing is pending", () => {
      expect(buffer.cancel()).toBeNull()
    })
  })

  describe("subscribe", () => {
    it("stops notifying once disposed", () => {
      const listener = vi.fn()
      const subscription = buffer.subscribe(listener)

      subscription.dispose()
      buffer.open(CHORD_LEADER, [publish])

      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe("dispose", () => {
    it("clears a pending timer, so a torn-down buffer cannot fire", () => {
      buffer.open(CHORD_LEADER, [publish])
      buffer.dispose()

      vi.advanceTimersByTime(5_000)

      expect(outcomes.filter((outcome) => outcome.type === "cancelled")).toEqual([])
      expect(buffer.isOpen).toBe(false)
    })
  })
})
