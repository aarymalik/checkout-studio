import type { KeyBinding, ScopeId, ShortcutRegistration } from "./types"
import { serializeBinding } from "./normalize"
import { isReserved } from "./reserved"

/**
 * A person's changes to the keymap.
 *
 * Sparse: only what differs from what the product ships, so a shortcut that
 * changes in a later version changes for everybody who never touched it.
 *
 * There is no preset field yet. Figma and Framer presets differ only in canvas
 * bindings, and there are no canvas bindings to differ — a preset selector that
 * changed nothing would be a control that lies.
 *
 * See docs/keyboard-shortcuts.md § Customization.
 */

export interface KeymapOverride {
  commandId: string
  scope: ScopeId
  /** Null disables the shortcut entirely. */
  binding: KeyBinding | null
}

export interface UserKeymap {
  overrides: readonly KeymapOverride[]
  /**
   * WCAG 2.1.4.
   *
   * A shortcut that is a single character with no modifier can be triggered by
   * speech input — dictating a sentence into a page that binds "S" inserts a
   * section. It must be possible to switch them off, and this is the switch.
   */
  characterKeysEnabled: boolean
}

export const DEFAULT_KEYMAP: UserKeymap = { overrides: [], characterKeysEnabled: true }

function isBinding(value: unknown): value is KeyBinding {
  if (typeof value !== "object" || value === null) return false

  const candidate = value as Record<string, unknown>

  return typeof candidate["key"] === "string" && candidate["key"] !== ""
}

function normalizeBinding(value: unknown): KeyBinding | null {
  if (!isBinding(value)) return null

  const source = value as unknown as KeyBinding
  const binding: KeyBinding = { key: source.key }

  // Rebuilt field by field rather than copied: a stored object may carry keys
  // this version does not know about, and a binding is compared by serializing
  // it.
  if (source.mod === true) binding.mod = true
  if (source.shift === true) binding.shift = true
  if (source.alt === true) binding.alt = true
  if (source.ctrl === true) binding.ctrl = true

  return binding
}

/** A stored keymap, made safe to apply. Anything unrecognisable is dropped. */
export function normalizeKeymap(value: unknown): UserKeymap {
  if (typeof value !== "object" || value === null) return DEFAULT_KEYMAP

  const stored = value as Record<string, unknown>
  const raw = Array.isArray(stored["overrides"]) ? stored["overrides"] : []

  const overrides: KeymapOverride[] = []

  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue

    const candidate = entry as Record<string, unknown>
    const commandId = candidate["commandId"]
    const scope = candidate["scope"]

    if (typeof commandId !== "string" || typeof scope !== "string") continue

    overrides.push({
      commandId,
      scope: scope as ScopeId,
      binding: normalizeBinding(candidate["binding"]),
    })
  }

  return {
    overrides,
    characterKeysEnabled: stored["characterKeysEnabled"] !== false,
  }
}

/** Whether a binding is a bare character key, which speech input can trigger. */
export function isCharacterKey(binding: KeyBinding): boolean {
  if (binding.mod === true || binding.alt === true || binding.ctrl === true) return false

  return /^(Key[A-Z]|Digit[0-9]|Slash|Comma|Period|Semicolon|Quote|Backquote|Minus|Equal)$/.test(
    binding.key,
  )
}

/**
 * The bindings to register, with a person's changes applied.
 *
 * An override that names a reserved key is dropped rather than applied: the
 * Settings screen refuses those with an explanation, and a stored one can only
 * mean the rules tightened since it was saved.
 */
export function resolveShortcuts(
  defaults: readonly ShortcutRegistration[],
  keymap: UserKeymap,
): readonly ShortcutRegistration[] {
  const overrides = new Map(
    keymap.overrides.map((override) => [`${override.commandId}\u0000${override.scope}`, override]),
  )

  const resolved: ShortcutRegistration[] = []
  const replaced = new Set<string>()

  for (const registration of defaults) {
    const key = `${registration.commandId}\u0000${registration.scope}`
    const override = overrides.get(key)

    // A null binding is a shortcut somebody switched off.
    if (override?.binding === null) continue

    if (override === undefined) {
      resolved.push(registration)
      continue
    }

    // A reserved key means the override is unusable, not that the shortcut is
    // gone: the shipped bindings stand.
    if (isReserved(override.binding, registration.scope)) {
      resolved.push(registration)
      continue
    }

    /*
     * One override replaces every binding the command had in that scope.
     *
     * Some commands ship with two spellings — the shortcut reference is ⌘/ and
     * also plain ? — and applying an override to each would register the chosen
     * key twice, which conflict detection would rightly call ambiguous. Somebody
     * who picks a key has picked the key.
     */
    if (replaced.has(key)) continue

    replaced.add(key)
    resolved.push({ ...registration, binding: override.binding })
  }

  return keymap.characterKeysEnabled
    ? resolved
    : resolved.filter((registration) => !isCharacterKey(registration.binding))
}

/**
 * Why a rebinding cannot be accepted, or null when it can.
 *
 * Checked before anything is stored, so a refusal comes with a reason rather
 * than being accepted and quietly ignored.
 */
export function explainRebinding(
  binding: KeyBinding,
  scope: ScopeId,
  existing: readonly ShortcutRegistration[],
  commandId: string,
): string | null {
  if (isReserved(binding, scope)) {
    return "The browser or the operating system owns this key."
  }

  const serialized = serializeBinding(binding)
  const incumbent = existing.find(
    (registration) =>
      registration.scope === scope &&
      registration.commandId !== commandId &&
      serializeBinding(registration.binding) === serialized,
  )

  return incumbent === undefined ? null : `Already used by "${incumbent.commandId}" here.`
}
