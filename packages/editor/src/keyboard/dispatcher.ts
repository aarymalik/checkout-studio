import type { Command, EditorContext } from "../commands/types"
import { runCommand, type CommandTelemetry } from "../commands/run"
import type { Disposable, KeyBinding, Platform, ScopeId } from "./types"
import { bindingFromEvent, detectPlatform } from "./normalize"
import { allowedWhileOverlayOpen, hasOverlay } from "./scopes"
import { isPlatformTextEditingKey, isTextEntry, passesTextGuard } from "./guards"
import { ChordBuffer, type ChordListener, type ChordOutcome } from "./chords"
import { keymap as defaultKeymap, type KeymapRegistry } from "./registry"
import { type CommandRegistry, commands as defaultCommands } from "../commands/registry"

/**
 * One keyboard listener for the whole application.
 *
 * Per-component listeners are how a keystroke ends up handled twice, or handled
 * by whichever component mounted last. Everything arrives here, is decided
 * against the keymap and the active scopes, and is either run or deliberately
 * left to the browser.
 */

/** Why a keystroke did what it did. Returned for tests and for the inspector. */
export type DispatchResult =
  | { type: "ran"; commandId: string }
  | { type: "chord-open"; continuations: number }
  | { type: "chord-cancelled"; reason: "escape" | "unmatched" | "timeout" }
  | { type: "ignored"; reason: IgnoredReason }

export type IgnoredReason =
  /** A repeat of a held key, on a binding that does not repeat. */
  | "repeat"
  /** A modifier on its own. */
  | "modifier-only"
  /** Focus is in a text field and this key belongs to the field. */
  | "text-entry"
  /** An overlay is open and this key does not operate overlays. */
  | "overlay"
  /** Nothing is bound to it. */
  | "unbound"
  /** Something is bound, but it cannot run right now. */
  | "unavailable"

export interface DispatcherOptions {
  /** The scopes active at the moment of the keystroke. */
  getScopes: () => readonly ScopeId[]
  /** The context commands are asked about, and run with. */
  getContext: () => EditorContext
  keymap?: KeymapRegistry
  commands?: CommandRegistry
  platform?: Platform
  chordTimeoutMs?: number
  /** Where an async command's rejection goes. Defaults to rethrowing. */
  onError?: (error: unknown, commandId: string) => void
  /** Where a run is reported, when anybody is listening. */
  telemetry?: CommandTelemetry
}

/** Modifiers alone are never a shortcut, and arrive as their own keydown. */
const MODIFIER_CODES = new Set([
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
  "CapsLock",
])

export class KeyboardDispatcher {
  private readonly options: DispatcherOptions
  private readonly keymap: KeymapRegistry
  private readonly commands: CommandRegistry
  private readonly platform: Platform
  private readonly chords: ChordBuffer

  constructor(options: DispatcherOptions) {
    this.options = options
    this.keymap = options.keymap ?? defaultKeymap
    this.commands = options.commands ?? defaultCommands
    this.platform = options.platform ?? detectPlatform()
    this.chords = new ChordBuffer(
      options.chordTimeoutMs === undefined ? {} : { timeoutMs: options.chordTimeoutMs },
    )
  }

  /** Follow the chord buffer, so the hint bar can show continuations. */
  onChord(listener: ChordListener): Disposable {
    return this.chords.subscribe(listener)
  }

  /**
   * Start listening.
   *
   * Capture phase, so a component cannot quietly take a keystroke first, and so
   * the text guard decides rather than whichever field happens to stop
   * propagation.
   */
  attach(target: EventTarget): Disposable {
    const onKeyDown = (event: Event): void => {
      this.handle(event as KeyboardEvent)
    }
    const onBlur = (): void => {
      this.chords.cancel()
    }

    target.addEventListener("keydown", onKeyDown, true)
    target.addEventListener("blur", onBlur)

    return {
      dispose: () => {
        target.removeEventListener("keydown", onKeyDown, true)
        target.removeEventListener("blur", onBlur)
        this.chords.dispose()
      },
    }
  }

  /** Decide a single keystroke. Exposed so the behaviour can be tested directly. */
  handle(event: KeyboardEvent): DispatchResult {
    if (MODIFIER_CODES.has(event.code)) return { type: "ignored", reason: "modifier-only" }

    const binding = bindingFromEvent(event, this.platform)
    const scopes = this.options.getScopes()
    const context = this.options.getContext()

    // A held key mid-chord is not a second stroke, and a held key on a binding
    // that does not repeat is one keystroke, not forty.
    if (event.repeat && this.chords.isOpen) return { type: "ignored", reason: "repeat" }

    const chord = this.chords.feed(binding)
    if (chord !== null) {
      // Mid-chord, every stroke belongs to the chord — including the one that
      // ends it unmatched, which is discarded rather than passed through.
      event.preventDefault()

      return this.fromChord(chord, context)
    }

    if (this.isBlockedByTextEntry(event, binding)) return { type: "ignored", reason: "text-entry" }

    if (hasOverlay(scopes) && !allowedWhileOverlayOpen(binding.key)) {
      const overlayResolution = this.keymap.resolve(binding, scopes, context)
      if (!("match" in overlayResolution)) return { type: "ignored", reason: "overlay" }
    }

    const continuations = this.keymap.chordContinuations(binding, scopes, context)
    if (continuations.length > 0) {
      event.preventDefault()
      this.chords.open(binding, continuations)

      return { type: "chord-open", continuations: continuations.length }
    }

    const resolution = this.keymap.resolve(binding, scopes, context)
    if (!("match" in resolution)) return { type: "ignored", reason: resolution.miss }

    const { registration, command } = resolution.match

    if (event.repeat && registration.allowRepeat !== true) {
      // Still ours, so the browser does not act on the repeat either.
      if (registration.preventDefault !== false) event.preventDefault()

      return { type: "ignored", reason: "repeat" }
    }

    if (registration.preventDefault !== false) event.preventDefault()

    this.run(command, context)

    return { type: "ran", commandId: command.id }
  }

  /**
   * Whether focus is in a text field and this keystroke belongs to it.
   *
   * The one guard that matters most: Backspace while somebody is editing a
   * heading must delete a character, not the section the heading is in.
   */
  private isBlockedByTextEntry(event: KeyboardEvent, binding: KeyBinding): boolean {
    if (!isTextEntry(event.target)) return false

    return !passesTextGuard(binding) || isPlatformTextEditingKey(binding, this.platform)
  }

  /** Feeding the buffer either resolves a sequence or closes it; never opens one. */
  private fromChord(
    outcome: Exclude<ChordOutcome, { type: "open" }>,
    context: EditorContext,
  ): DispatchResult {
    if (outcome.type === "cancelled") return { type: "chord-cancelled", reason: outcome.reason }

    const command = this.commands.get(outcome.commandId)
    if (command === null || !command.isAvailable(context)) {
      return { type: "ignored", reason: "unavailable" }
    }

    this.run(command, context)

    return { type: "ran", commandId: command.id }
  }

  /**
   * Run a command through the shared runner.
   *
   * The error discipline lived here and only here, which meant every button in
   * the application dropped a rejected promise on the floor. It is in
   * `runCommand` now, along with the timing, so the keyboard is one source
   * among several rather than the only instrumented one.
   */
  private run(command: Command, context: EditorContext): void {
    runCommand(command, context, "keyboard", {
      ...(this.options.telemetry === undefined ? {} : { telemetry: this.options.telemetry }),
      onError: (error, commandId) => {
        if (this.options.onError === undefined) throw error

        this.options.onError(error, commandId)
      },
    })
  }
}
