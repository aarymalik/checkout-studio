import type { Command, EditorContext } from "../commands/types"
import { type CommandRegistry, commands as defaultCommands } from "../commands/registry"
import type {
  Disposable,
  KeyBinding,
  Platform,
  ScopeId,
  ShortcutConflict,
  ShortcutRegistration,
} from "./types"
import { formatBinding, serializeBinding } from "./normalize"
import { depthOf, resolveActiveScopes } from "./scopes"
import { detectConflicts, ShortcutConflictError } from "./conflicts"
import type { ChordContinuation } from "./chords"

/**
 * The keymap.
 *
 * Bindings live here and nowhere else. Menus, tooltips, the command palette and
 * the shortcut reference all read their labels from this one object, so a
 * rebound key changes everywhere at once and nothing can disagree with anything
 * else about what ⌘D does.
 *
 * See docs/keyboard-shortcuts.md § Internal Structure.
 */

/** A keystroke matched to something that can actually run. */
export interface ShortcutMatch {
  registration: ShortcutRegistration
  command: Command
}

/** Why a resolution came back empty, which decides whether to preventDefault. */
export type ResolutionMiss =
  /** Nothing is bound to this key in any active scope. */
  | "unbound"
  /** Something is bound, but it cannot run right now. The browser keeps the key. */
  | "unavailable"

export type Resolution = { match: ShortcutMatch } | { miss: ResolutionMiss }

export class KeymapRegistry {
  private readonly registrations: ShortcutRegistration[] = []
  private readonly commands: CommandRegistry

  /** Rebuilt on the next read after any change. */
  private index: Map<ScopeId, Map<string, ShortcutRegistration[]>> | null = null

  constructor(commands: CommandRegistry = defaultCommands) {
    this.commands = commands
  }

  /**
   * Add a binding.
   *
   * Permissive by design: a binding that conflicts is still recorded, so that
   * `conflicts()` can report every problem at once instead of throwing on the
   * first one and hiding the rest.
   */
  register(registration: ShortcutRegistration): Disposable {
    this.registrations.push(registration)
    this.index = null

    return {
      dispose: () => {
        const at = this.registrations.indexOf(registration)
        if (at !== -1) {
          this.registrations.splice(at, 1)
          this.index = null
        }
      },
    }
  }

  /** Add a set of bindings, disposed together. */
  registerAll(registrations: readonly ShortcutRegistration[]): Disposable {
    const disposables = registrations.map((registration) => this.register(registration))

    return {
      dispose: () => {
        for (const disposable of disposables) disposable.dispose()
      },
    }
  }

  /** Remove every binding of a command in a scope. Returns how many went. */
  unregister(commandId: string, scope: ScopeId): number {
    let removed = 0

    for (let at = this.registrations.length - 1; at >= 0; at -= 1) {
      const registration = this.registrations[at] as ShortcutRegistration
      if (registration.commandId === commandId && registration.scope === scope) {
        this.registrations.splice(at, 1)
        removed += 1
      }
    }

    if (removed > 0) this.index = null

    return removed
  }

  /** Remove everything a plugin registered, for when it unloads. */
  removePlugin(pluginId: string): number {
    let removed = 0

    for (let at = this.registrations.length - 1; at >= 0; at -= 1) {
      if ((this.registrations[at] as ShortcutRegistration).pluginId === pluginId) {
        this.registrations.splice(at, 1)
        removed += 1
      }
    }

    if (removed > 0) this.index = null

    return removed
  }

  all(): readonly ShortcutRegistration[] {
    return [...this.registrations]
  }

  /**
   * What a keystroke means right now.
   *
   * Scopes are tried deepest first, so `canvas.selection` beats `canvas` beats
   * `global`. A scope whose binding exists but cannot run is passed over rather
   * than treated as a match, which is what lets ⌘D duplicate a selected node and
   * still bookmark the page when nothing is selected.
   */
  resolve(
    binding: KeyBinding,
    activeScopes: readonly ScopeId[],
    context: EditorContext,
  ): Resolution {
    const stroke = serializeBinding(binding)
    const index = this.ensureIndex()
    let sawBinding = false

    for (const scope of resolveActiveScopes(activeScopes)) {
      for (const registration of index.get(scope)?.get(stroke) ?? []) {
        sawBinding = true

        const command = this.commands.get(registration.commandId)
        if (command === null || !command.isAvailable(context)) continue

        return { match: { registration, command } }
      }
    }

    return { miss: sawBinding ? "unavailable" : "unbound" }
  }

  /**
   * The sequences a leader could still complete, for the hint bar.
   *
   * Empty means the stroke is not a leader in any active scope, and the
   * dispatcher should treat it as an ordinary keystroke.
   */
  chordContinuations(
    leader: KeyBinding,
    activeScopes: readonly ScopeId[],
    context: EditorContext,
  ): readonly ChordContinuation[] {
    const prefix = `${serializeBinding(leader)} `
    const continuations: ChordContinuation[] = []
    const seen = new Set<string>()

    for (const scope of resolveActiveScopes(activeScopes)) {
      for (const registration of this.registrations) {
        if (registration.scope !== scope) continue

        const [stroke] = registration.binding.chord ?? []
        if (stroke === undefined) continue

        const sequence = serializeBinding(registration.binding)
        if (!sequence.startsWith(prefix) || seen.has(sequence)) continue

        const command = this.commands.get(registration.commandId)
        if (command === null || !command.isAvailable(context)) continue

        seen.add(sequence)
        continuations.push({ sequence, stroke, commandId: registration.commandId })
      }
    }

    return continuations
  }

  /**
   * The binding to show beside a command's name.
   *
   * A command bound in several scopes has one label, and it is the most specific
   * binding — that is the one a person is holding when they think of the
   * command. Highest priority breaks a tie.
   */
  bindingFor(commandId: string): KeyBinding | null {
    const candidates = this.registrations.filter(
      (registration) => registration.commandId === commandId,
    )

    if (candidates.length === 0) return null

    const best = candidates.reduce((winner, candidate) => {
      const byPriority = (candidate.priority ?? 0) - (winner.priority ?? 0)
      if (byPriority !== 0) return byPriority > 0 ? candidate : winner

      return depthOf(candidate.scope) > depthOf(winner.scope) ? candidate : winner
    })

    return best.binding
  }

  /** A binding written the way it is shown to a person. */
  format(binding: KeyBinding, platform: Platform): string {
    return formatBinding(binding, platform)
  }

  /** Every ambiguity in the current keymap. */
  conflicts(): readonly ShortcutConflict[] {
    return detectConflicts(this.registrations, {
      commandExists: (commandId) => this.commands.has(commandId),
    })
  }

  /**
   * Fail if the keymap is ambiguous.
   *
   * Called once at startup and again after each plugin loads. Warnings are
   * returned rather than thrown: they have a defined winner, so the application
   * can run while somebody decides whether the override was intended.
   */
  assertNoConflicts(): readonly ShortcutConflict[] {
    const conflicts = this.conflicts()
    const errors = conflicts.filter((conflict) => conflict.severity === "error")

    if (errors.length > 0) throw new ShortcutConflictError(errors)

    return conflicts.filter((conflict) => conflict.severity === "warning")
  }

  private ensureIndex(): Map<ScopeId, Map<string, ShortcutRegistration[]>> {
    if (this.index !== null) return this.index

    const index = new Map<ScopeId, Map<string, ShortcutRegistration[]>>()

    for (const registration of this.registrations) {
      const sequence = serializeBinding(registration.binding)

      // A chord is reached through its leader, never by a single stroke.
      if (sequence.includes(" ")) continue

      const byStroke = index.get(registration.scope) ?? new Map<string, ShortcutRegistration[]>()
      const bucket = byStroke.get(sequence) ?? []

      bucket.push(registration)
      byStroke.set(sequence, bucket)
      index.set(registration.scope, byStroke)
    }

    for (const byStroke of index.values()) {
      for (const bucket of byStroke.values()) {
        bucket.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
      }
    }

    this.index = index

    return index
  }
}

/** The application's keymap. */
export const keymap = new KeymapRegistry()
