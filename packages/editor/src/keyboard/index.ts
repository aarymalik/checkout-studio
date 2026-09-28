export type {
  Disposable,
  KeyBinding,
  Platform,
  ScopeId,
  ShortcutConflict,
  ShortcutRegistration,
} from "./types"

export {
  bindingFromEvent,
  detectPlatform,
  formatBinding,
  platformFor,
  serializeBinding,
  serializeEvent,
} from "./normalize"

export {
  allowedWhileOverlayOpen,
  depthOf,
  hasOverlay,
  isOverlay,
  resolveActiveScopes,
} from "./scopes"

export {
  allowedInTextEntry,
  isPlatformTextEditingKey,
  isTextEntry,
  passesTextGuard,
} from "./guards"

export {
  DOCUMENTED_EXCEPTIONS,
  isDocumentedException,
  isReserved,
  reservedBindings,
} from "./reserved"

export {
  ShortcutConflictError,
  describe as describeConflicts,
  detectConflicts,
  explainRefusal,
} from "./conflicts"

export {
  CHORD_LEADER,
  CHORD_TIMEOUT_MS,
  ChordBuffer,
  type ChordContinuation,
  type ChordOutcome,
} from "./chords"

export { KeymapRegistry, keymap, type Resolution, type ShortcutMatch } from "./registry"
export { KeyboardDispatcher, type DispatchResult, type DispatcherOptions } from "./dispatcher"

export {
  KeyboardProvider,
  useActiveScopes,
  useChordHint,
  useKeyboard,
  type EditorState,
  type KeyboardProviderProps,
} from "./context"

export { useScope, useShortcut, useShortcutLabel } from "./hooks"

export {
  DEFAULT_KEYMAP,
  explainRebinding,
  isCharacterKey,
  normalizeKeymap,
  resolveShortcuts,
} from "./persistence"
export type { KeymapOverride, UserKeymap } from "./persistence"

export { defaultShortcuts, globalShortcuts, paletteKeys, shellShortcuts } from "./defaults"
export type { ContextualKey } from "./defaults"
