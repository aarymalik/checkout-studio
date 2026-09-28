import type { KeyBinding } from "./types"
import { serializeBinding } from "./normalize"

/**
 * Multi-stroke sequences.
 *
 * The leader is ⌥K rather than ⌘K, because ⌘K opens the command palette
 * immediately and the palette's overlay scope is exclusive — a second keystroke
 * would be typed into its search box instead of completing the chord.
 *
 * See docs/keyboard-shortcuts.md § Chords.
 */

export const CHORD_LEADER: KeyBinding = { key: "KeyK", alt: true }

/** How long the buffer waits for the second stroke. */
export const CHORD_TIMEOUT_MS = 2_000

/** One thing the leader could still turn into, for the hint bar. */
export interface ChordContinuation {
  /** The whole sequence, serialized: "alt+KeyK KeyP". */
  sequence: string
  /** Just the second stroke, for the hint bar's label. */
  stroke: KeyBinding
  commandId: string
}

export type ChordOutcome =
  /** The leader was consumed; the buffer is now open. */
  | { type: "open"; continuations: readonly ChordContinuation[] }
  /** A second stroke completed a sequence. */
  | { type: "resolved"; sequence: string; commandId: string }
  /** The buffer closed without running anything. The stroke is discarded. */
  | { type: "cancelled"; reason: "escape" | "unmatched" | "timeout" }

export type ChordListener = (outcome: ChordOutcome) => void

/**
 * The buffer holding a leader while it waits for what comes next.
 *
 * It owns no keyboard listener of its own: the dispatcher feeds it, because the
 * dispatcher is the one place that decides what a keystroke means. An unmatched
 * second stroke is discarded rather than passed through — a person mid-chord
 * did not mean to type a letter, and acting on it is worse than doing nothing.
 */
export class ChordBuffer {
  private leader: KeyBinding | null = null
  private continuations: readonly ChordContinuation[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private readonly listeners = new Set<ChordListener>()
  private readonly timeoutMs: number

  constructor(options: { timeoutMs?: number } = {}) {
    this.timeoutMs = options.timeoutMs ?? CHORD_TIMEOUT_MS
  }

  /** Whether a leader is currently held. */
  get isOpen(): boolean {
    return this.leader !== null
  }

  /** What the leader could still become. Empty when the buffer is closed. */
  get pending(): readonly ChordContinuation[] {
    return this.continuations
  }

  /** Called on every state change, so the hint bar can follow along. */
  subscribe(listener: ChordListener): { dispose: () => void } {
    this.listeners.add(listener)

    return {
      dispose: () => {
        this.listeners.delete(listener)
      },
    }
  }

  /**
   * Hold a leader.
   *
   * Opening while already open replaces the buffer rather than nesting: chords
   * are two strokes deep by design, and a leader pressed twice means the person
   * started again.
   */
  open(leader: KeyBinding, continuations: readonly ChordContinuation[]): ChordOutcome {
    this.clearTimer()

    this.leader = leader
    this.continuations = continuations
    this.timer = setTimeout(() => {
      this.close("timeout")
    }, this.timeoutMs)

    return this.emit({ type: "open", continuations })
  }

  /**
   * Offer a second stroke.
   *
   * Returns null when the buffer is closed, in which case the dispatcher should
   * treat the stroke as an ordinary keystroke.
   */
  feed(stroke: KeyBinding): Exclude<ChordOutcome, { type: "open" }> | null {
    if (this.leader === null) return null

    if (stroke.key === "Escape") return this.close("escape")

    const sequence = `${serializeBinding(this.leader)} ${serializeBinding(stroke)}`
    const match = this.continuations.find((entry) => entry.sequence === sequence)

    if (match === undefined) return this.close("unmatched")

    this.reset()
    this.emit({ type: "resolved", sequence, commandId: match.commandId })

    return { type: "resolved", sequence, commandId: match.commandId }
  }

  /** Abandon the buffer, as leaving the window or clicking elsewhere does. */
  cancel(): Exclude<ChordOutcome, { type: "open" }> | null {
    return this.leader === null ? null : this.close("escape")
  }

  dispose(): void {
    this.clearTimer()
    this.reset()
    this.listeners.clear()
  }

  private close(reason: "escape" | "unmatched" | "timeout"): {
    type: "cancelled"
    reason: typeof reason
  } {
    this.reset()
    this.emit({ type: "cancelled", reason })

    return { type: "cancelled", reason }
  }

  private reset(): void {
    this.clearTimer()
    this.leader = null
    this.continuations = []
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private emit(outcome: ChordOutcome): ChordOutcome {
    for (const listener of this.listeners) listener(outcome)

    return outcome
  }
}
