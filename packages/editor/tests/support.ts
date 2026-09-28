import type { Command, EditorContext } from "../src/commands/types"
import type { KeyBinding, Platform } from "../src/keyboard/types"

/** A command that records whether it ran, with everything else defaulted. */
export function makeCommand(overrides: Partial<Command> & Pick<Command, "id">): Command {
  return {
    title: overrides.id,
    category: "edit",
    isAvailable: () => true,
    run: () => undefined,
    mutates: false,
    ...overrides,
  }
}

export function makeContext(overrides: Partial<EditorContext> = {}): EditorContext {
  return {
    scopes: [],
    selectionCount: 0,
    isEditingText: false,
    isDirty: false,
    ...overrides,
  }
}

/**
 * A keydown event as the platform would deliver it.
 *
 * `mod` is translated the way the browser does — metaKey on a Mac, ctrlKey
 * elsewhere — so that a test says what the person pressed rather than which
 * property the browser set.
 */
export function keyEvent(
  binding: KeyBinding,
  platform: Platform,
  options: { target?: EventTarget; repeat?: boolean } = {},
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    code: binding.key,
    metaKey: platform === "mac" && binding.mod === true,
    ctrlKey: (platform !== "mac" && binding.mod === true) || binding.ctrl === true,
    altKey: binding.alt === true,
    shiftKey: binding.shift === true,
    repeat: options.repeat ?? false,
    bubbles: true,
    cancelable: true,
  })

  if (options.target !== undefined) {
    Object.defineProperty(event, "target", { value: options.target })
  }

  return event
}
