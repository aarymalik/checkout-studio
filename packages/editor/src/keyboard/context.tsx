"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react"

import type { EditorContext } from "../commands/types"
import { type CommandRegistry, commands as defaultCommands } from "../commands/registry"
import type { Platform, ScopeId } from "./types"
import { detectPlatform } from "./normalize"
import { type KeymapRegistry, keymap as defaultKeymap } from "./registry"
import { KeyboardDispatcher } from "./dispatcher"
import type { ChordContinuation } from "./chords"
import { isTextEntry } from "./guards"

/**
 * The keyboard system, made available to React.
 *
 * One dispatcher and one scope stack for the whole application. Components
 * declare which scope they are (`useScope`) and which bindings they add
 * (`useShortcut`); nothing installs a listener of its own.
 */

interface ScopeStore {
  /** Deepest last, in mount order. */
  read: () => readonly ScopeId[]
  push: (scope: ScopeId) => () => void
  subscribe: (listener: () => void) => () => void
}

function createScopeStore(): ScopeStore {
  // Entries rather than a Set, so the same scope mounted twice must be released
  // twice — otherwise unmounting one of two open dialogs drops the scope.
  let entries: Array<{ scope: ScopeId }> = []
  // Global is always active, and nothing declares it. It is what "anywhere"
  // means: ⌘K works on the dashboard, in the editor and inside a panel alike.
  let snapshot: readonly ScopeId[] = ["global"]
  const listeners = new Set<() => void>()

  const commit = (): void => {
    snapshot = ["global", ...entries.map((entry) => entry.scope)]
    for (const listener of listeners) listener()
  }

  return {
    read: () => snapshot,
    push: (scope) => {
      const entry = { scope }
      entries = [...entries, entry]
      commit()

      return () => {
        entries = entries.filter((candidate) => candidate !== entry)
        commit()
      }
    },
    subscribe: (listener) => {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },
  }
}

interface KeyboardContextValue {
  keymap: KeymapRegistry
  commands: CommandRegistry
  platform: Platform
  scopes: ScopeStore
  dispatcher: KeyboardDispatcher
  chord: {
    read: () => readonly ChordContinuation[]
    subscribe: (listener: () => void) => () => void
  }
}

const KeyboardContext = createContext<KeyboardContextValue | null>(null)

/** What the editor knows about itself, beyond what the keyboard tracks. */
export interface EditorState {
  selectionCount: number
  isDirty: boolean
}

export interface KeyboardProviderProps {
  children: ReactNode
  /** Editor state the keyboard cannot work out for itself. */
  getState?: () => EditorState
  keymap?: KeymapRegistry
  commands?: CommandRegistry
  /** Forced for tests; detected otherwise. */
  platform?: Platform
  /** Where a command's failure goes. Rethrown when absent. */
  onError?: (error: unknown, commandId: string) => void
}

const IDLE_STATE: EditorState = { selectionCount: 0, isDirty: false }

export function KeyboardProvider({
  children,
  getState,
  keymap = defaultKeymap,
  commands = defaultCommands,
  platform,
  onError,
}: KeyboardProviderProps): ReactNode {
  const scopes = useMemo(createScopeStore, [])

  // Read through a ref so that changing the callback does not rebuild the
  // dispatcher, which would drop the chord buffer mid-chord.
  const stateRef = useRef(getState)
  stateRef.current = getState

  const errorRef = useRef(onError)
  errorRef.current = onError

  const chordRef = useRef<readonly ChordContinuation[]>([])
  const chordListeners = useMemo(() => new Set<() => void>(), [])

  const dispatcher = useMemo(
    () =>
      new KeyboardDispatcher({
        keymap,
        commands,
        ...(platform === undefined ? {} : { platform }),
        getScopes: () => scopes.read(),
        getContext: () => {
          const state = stateRef.current?.() ?? IDLE_STATE

          return {
            scopes: scopes.read(),
            selectionCount: state.selectionCount,
            isDirty: state.isDirty,
            // Derived rather than tracked: the element with focus is the truth,
            // and anything else can disagree with it.
            isEditingText: isTextEntry(document.activeElement),
          } satisfies EditorContext
        },
        onError: (error, commandId) => {
          if (errorRef.current === undefined) throw error

          errorRef.current(error, commandId)
        },
      }),
    [keymap, commands, platform, scopes],
  )

  useEffect(() => {
    const subscription = dispatcher.onChord((outcome) => {
      chordRef.current = outcome.type === "open" ? outcome.continuations : []
      for (const listener of chordListeners) listener()
    })

    const attachment = dispatcher.attach(window)

    return () => {
      subscription.dispose()
      attachment.dispose()
    }
  }, [dispatcher, chordListeners])

  const value = useMemo<KeyboardContextValue>(
    () => ({
      keymap,
      commands,
      platform: platform ?? detectPlatform(),
      scopes,
      dispatcher,
      chord: {
        read: () => chordRef.current,
        subscribe: (listener) => {
          chordListeners.add(listener)

          return () => {
            chordListeners.delete(listener)
          }
        },
      },
    }),
    [keymap, commands, platform, scopes, dispatcher, chordListeners],
  )

  return <KeyboardContext.Provider value={value}>{children}</KeyboardContext.Provider>
}

/** The keyboard system. Throws outside a provider, because there is no sane default. */
export function useKeyboard(): KeyboardContextValue {
  const value = useContext(KeyboardContext)

  if (value === null) {
    throw new Error("useKeyboard must be used inside a <KeyboardProvider>.")
  }

  return value
}

/** The scopes currently active, deepest last. Re-renders when they change. */
export function useActiveScopes(): readonly ScopeId[] {
  const { scopes } = useKeyboard()

  return useSyncExternalStore(scopes.subscribe, scopes.read, scopes.read)
}

/**
 * What a held chord leader could still become.
 *
 * Empty when no chord is pending, which is what the hint bar uses to decide
 * whether to show itself.
 */
export function useChordHint(): readonly ChordContinuation[] {
  const { chord } = useKeyboard()
  const read = useCallback(() => chord.read(), [chord])

  return useSyncExternalStore(chord.subscribe, read, read)
}
