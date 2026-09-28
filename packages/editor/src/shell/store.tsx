"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react"
import { LAYOUT, clampWidth } from "@checkout-studio/design-system"

import { DEFAULT_LAYOUT, layoutsEqual, type ShellLayout, type SidebarTabId } from "./layout"

/**
 * The frame's state.
 *
 * Panels are the only thing in the editor that a person arranges and expects to
 * find again, so this is the one piece of interface state that is persisted. It
 * is kept out of the components that draw the frame: a resize handle should not
 * know how a layout is saved, and the toolbar should not know which panel a
 * command belongs to.
 */

type Action =
  | { type: "resize-left"; width: number }
  | { type: "resize-right"; width: number }
  | { type: "toggle-left" }
  | { type: "toggle-right" }
  | { type: "toggle-both" }
  | { type: "select-tab"; tab: SidebarTabId }
  | { type: "reset" }

function reduce(layout: ShellLayout, action: Action): ShellLayout {
  switch (action.type) {
    case "resize-left":
      return { ...layout, leftWidth: clampWidth(action.width, LAYOUT.left) }
    case "resize-right":
      return { ...layout, rightWidth: clampWidth(action.width, LAYOUT.right) }
    case "toggle-left":
      return { ...layout, leftCollapsed: !layout.leftCollapsed }
    case "toggle-right":
      return { ...layout, rightCollapsed: !layout.rightCollapsed }
    /*
     * Zen mode is a single state, not two toggles.
     *
     * With one panel open, ⌘. closes both rather than swapping which one is
     * open — the shortcut means "get out of my way", and a half-answer to that
     * needs a second press to finish.
     */
    case "toggle-both": {
      const hidden = layout.leftCollapsed && layout.rightCollapsed

      return { ...layout, leftCollapsed: !hidden, rightCollapsed: !hidden }
    }
    /*
     * Choosing a tab opens the panel.
     *
     * ⌥2 with the sidebar collapsed means "show me the layers", and answering it
     * by selecting an invisible tab is the kind of literal-mindedness that makes
     * software feel broken.
     */
    case "select-tab":
      return { ...layout, sidebarTab: action.tab, leftCollapsed: false }
    case "reset":
      return DEFAULT_LAYOUT
  }
}

export interface ShellActions {
  resizeLeft: (width: number) => void
  resizeRight: (width: number) => void
  toggleLeft: () => void
  toggleRight: () => void
  toggleBoth: () => void
  selectTab: (tab: SidebarTabId) => void
  reset: () => void
}

interface ShellContextValue {
  layout: ShellLayout
  actions: ShellActions
}

const ShellContext = createContext<ShellContextValue | null>(null)

/** How long a drag settles before the layout is written back. */
export const PERSIST_DELAY_MS = 600

export interface ShellProviderProps {
  children: ReactNode
  /** The stored layout, resolved on the server so the first paint is correct. */
  initialLayout?: ShellLayout
  /**
   * Where a changed layout goes.
   *
   * Debounced, because a drag produces a change per frame and none of them are
   * worth a request on their own.
   */
  onPersist?: (layout: ShellLayout) => void
  persistDelayMs?: number
}

export function ShellProvider({
  children,
  initialLayout = DEFAULT_LAYOUT,
  onPersist,
  persistDelayMs = PERSIST_DELAY_MS,
}: ShellProviderProps): ReactNode {
  const [layout, dispatch] = useReducer(reduce, initialLayout)

  const persistRef = useRef(onPersist)
  persistRef.current = onPersist

  // What the server already has. Comparing against it means a drag that ends
  // where it started writes nothing.
  const persistedRef = useRef(initialLayout)

  useEffect(() => {
    if (layoutsEqual(layout, persistedRef.current)) return

    const timer = setTimeout(() => {
      persistedRef.current = layout
      persistRef.current?.(layout)
    }, persistDelayMs)

    return () => {
      clearTimeout(timer)
    }
  }, [layout, persistDelayMs])

  const actions = useMemo<ShellActions>(
    () => ({
      resizeLeft: (width) => dispatch({ type: "resize-left", width }),
      resizeRight: (width) => dispatch({ type: "resize-right", width }),
      toggleLeft: () => dispatch({ type: "toggle-left" }),
      toggleRight: () => dispatch({ type: "toggle-right" }),
      toggleBoth: () => dispatch({ type: "toggle-both" }),
      selectTab: (tab) => dispatch({ type: "select-tab", tab }),
      reset: () => dispatch({ type: "reset" }),
    }),
    [],
  )

  const value = useMemo(() => ({ layout, actions }), [layout, actions])

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
}

export function useShell(): ShellContextValue {
  const value = useContext(ShellContext)

  if (value === null) {
    throw new Error("useShell must be used inside a <ShellProvider>.")
  }

  return value
}

/** The layout alone, for a component that only draws it. */
export function useShellLayout(): ShellLayout {
  return useShell().layout
}

/** The actions alone, for a control that only changes it. */
export function useShellActions(): ShellActions {
  return useShell().actions
}

/** The width a panel is rendered at, accounting for being collapsed. */
export function useRenderedWidths(): { left: number; right: number } {
  const layout = useShellLayout()

  return useMemo(
    () => ({
      left: layout.leftCollapsed ? LAYOUT.leftCollapsed : layout.leftWidth,
      right: layout.rightCollapsed ? 0 : layout.rightWidth,
    }),
    [layout.leftCollapsed, layout.leftWidth, layout.rightCollapsed, layout.rightWidth],
  )
}
