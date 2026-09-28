import type { ScopeId, ShortcutConflict, ShortcutRegistration } from "./types"
import { serializeBinding } from "./normalize"
import { isReserved } from "./reserved"

/**
 * Startup conflict detection.
 *
 * A shadowed shortcut is close to undiagnosable after the fact: the key simply
 * does the wrong thing, or nothing, and no error is ever printed. So every
 * ambiguity is found the moment the bindings are declared, and an error fails
 * the build in CI and blocks plugin activation at runtime.
 *
 * See docs/keyboard-shortcuts.md § Conflict Detection.
 */

export interface ConflictOptions {
  /** Whether a command id exists. A binding to a missing command is an error. */
  commandExists: (commandId: string) => boolean
}

/** Errors block; warnings are resolved by priority and reported anyway. */
export function detectConflicts(
  registrations: readonly ShortcutRegistration[],
  options: ConflictOptions,
): readonly ShortcutConflict[] {
  const conflicts: ShortcutConflict[] = []
  const groups = new Map<string, ShortcutRegistration[]>()

  for (const registration of registrations) {
    if (!options.commandExists(registration.commandId)) {
      conflicts.push({
        binding: registration.binding,
        scope: registration.scope,
        commandIds: [registration.commandId],
        severity: "error",
        reason: `No command is registered as "${registration.commandId}".`,
      })
    }

    if (isReserved(registration.binding, registration.scope)) {
      conflicts.push({
        binding: registration.binding,
        scope: registration.scope,
        commandIds: [registration.commandId],
        severity: "error",
        reason: "The browser or the operating system owns this key.",
      })
    }

    const key = `${registration.scope}\u0000${serializeBinding(registration.binding)}`
    const group = groups.get(key)
    if (group === undefined) groups.set(key, [registration])
    else group.push(registration)
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue

    // Two bindings to the same command in the same scope are a duplicated
    // declaration, not an ambiguity — there is nothing to choose between.
    const commandIds = [...new Set(group.map((entry) => entry.commandId))]
    const priorities = new Set(group.map((entry) => entry.priority ?? 0))
    const first = group[0] as ShortcutRegistration

    if (commandIds.length === 1) {
      conflicts.push({
        binding: first.binding,
        scope: first.scope,
        commandIds,
        severity: "warning",
        reason: "The same binding is declared more than once for this command.",
      })
      continue
    }

    // Equal priority means nothing decides the winner, so there is no correct
    // behaviour to fall back on. Differing priority is a deliberate override.
    if (priorities.size === 1) {
      conflicts.push({
        binding: first.binding,
        scope: first.scope,
        commandIds,
        severity: "error",
        reason: `${commandIds.length} commands share this binding at equal priority.`,
      })
      continue
    }

    const highest = Math.max(...group.map((entry) => entry.priority ?? 0))
    const winner = group.find((entry) => (entry.priority ?? 0) === highest) as ShortcutRegistration

    conflicts.push({
      binding: first.binding,
      scope: first.scope,
      commandIds,
      severity: "warning",
      reason: `"${winner.commandId}" wins this binding on priority.`,
    })
  }

  return conflicts
}

/** Thrown at startup, and when a plugin's bindings cannot be accepted. */
export class ShortcutConflictError extends Error {
  readonly conflicts: readonly ShortcutConflict[]

  constructor(conflicts: readonly ShortcutConflict[]) {
    super(`${conflicts.length} keyboard shortcut conflict(s):\n${describe(conflicts)}`)
    this.name = "ShortcutConflictError"
    this.conflicts = conflicts
  }
}

/** Conflicts as lines a person can act on, for the console and for CI. */
export function describe(conflicts: readonly ShortcutConflict[]): string {
  return conflicts
    .map(
      (conflict) =>
        `  [${conflict.severity}] ${serializeBinding(conflict.binding)} in ${conflict.scope}: ${conflict.reason}`,
    )
    .join("\n")
}

/**
 * Why a binding may not be used in a scope, or null when it may.
 *
 * The Settings → Keyboard screen asks this before accepting a remap, so that
 * rebinding onto a reserved key is refused with a reason rather than accepted
 * and then quietly ignored.
 */
export function explainRefusal(
  binding: Parameters<typeof isReserved>[0],
  scope: ScopeId,
): string | null {
  return isReserved(binding, scope) ? "The browser or the operating system owns this key." : null
}
