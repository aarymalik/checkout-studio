"use client"

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react"
import {
  CommandRegistry,
  createViewportCommands,
  KeyboardProvider,
  KeymapRegistry,
  PaletteRegistry,
  ShellProvider,
  createCommandSource,
  createEditCommands,
  createShellCommands,
  defaultShortcuts,
  describeConflicts,
  resolveShortcuts,
  useOptionalEditorStoreApi,
  useShellActions,
  type EditorStoreApi,
  type Platform,
  type ShellActions,
  type ShortcutConflict,
  type ShellLayout,
  type UserKeymap,
} from "@checkout-studio/editor"
import { logger } from "@checkout-studio/observability"
import { TooltipProvider } from "@checkout-studio/ui"

import { OverlayProvider, useOverlays } from "./overlays"
import { PaletteScope } from "./palette-context"
import { createAppCommands, type AppCommandActions } from "./commands"
import { nextRegion } from "./regions"
import { send } from "@/lib/api-client"

/**
 * Everything the shell needs to exist, assembled once.
 *
 * The registries are built and filled while rendering rather than in an effect,
 * so the first paint already knows that Duplicate is ⌘D. Registering in an
 * effect would paint every shortcut label empty and fill them a frame later,
 * which reads as the interface flickering.
 *
 * They are also built per mount rather than taken from the module-level
 * singletons: the studio can be mounted twice in a test, and two mounts sharing
 * one registry means the second one's registrations collide with the first's.
 */

export interface StudioProvidersProps {
  children: ReactNode
  /** Resolved on the server, so the first paint is the layout they left. */
  initialLayout: ShellLayout
  /** Their remapped and disabled shortcuts, also resolved on the server. */
  userKeymap: UserKeymap
  /**
   * Which modifier to show.
   *
   * Read from the request's user agent rather than detected here, because the
   * server's own platform is not the reader's: navigator.platform is "MacIntel"
   * on a developer's machine and "Linux x86_64" in production, and a label that
   * flips from Ctrl to ⌘ on hydration is worse than one that was never wrong.
   */
  platform: Platform
}

export function StudioProviders({
  children,
  initialLayout,
  userKeymap,
  platform,
}: StudioProvidersProps) {
  const persist = useCallback((layout: ShellLayout) => {
    void send("/api/preferences/shell.layout", "PUT", { value: layout }).then((result) => {
      // A layout that failed to save is not worth interrupting anybody over: the
      // panels are where they put them, and the next change tries again.
      if (!result.ok) logger.warn("shell.layout_not_saved", { reason: result.code })
    })
  }, [])

  return (
    // One tooltip provider for the whole shell: every toolbar button and every
    // sidebar tab shows its binding, and they share one delay so moving along a
    // row does not re-arm the timer at each stop.
    <TooltipProvider>
      <ShellProvider initialLayout={initialLayout} onPersist={persist}>
        <OverlayProvider>
          <Registries userKeymap={userKeymap} platform={platform}>
            {children}
          </Registries>
        </OverlayProvider>
      </ShellProvider>
    </TooltipProvider>
  )
}

/**
 * Builds the registries from the actions the providers above expose.
 *
 * Commands are defined here rather than reaching for a store, so the same
 * definitions serve the keyboard, the palette, the toolbar and a menu — and so a
 * test can run them against a recorder instead of a rendered shell.
 */
function Registries({
  children,
  userKeymap,
  platform,
}: {
  children: ReactNode
  userKeymap: UserKeymap
  platform: Platform
}) {
  const shell = useShellActions()
  const overlays = useOverlays()

  /*
   * The store, if there is one.
   *
   * This provider renders with and without an open page, so it cannot demand
   * one — and the registries must not be rebuilt when a page arrives, or a
   * chord in progress is dropped. Read through a ref, like the overlays.
   */
  const editorStore = useOptionalEditorStoreApi()
  const editorStoreRef = useRef(editorStore)
  editorStoreRef.current = editorStore

  // Overlay state changes on every open and close; a command must reach the
  // current one without the registries being rebuilt around it.
  const overlaysRef = useRef(overlays)
  overlaysRef.current = overlays

  const { commands, keymap, palette, warnings } = useMemo(
    () =>
      build({
        shell,
        platform,
        userKeymap,
        viewportStore: () => editorStoreRef.current,
        app: {
          openPalette: () => overlaysRef.current.toggle("palette"),
          openShortcuts: () => overlaysRef.current.toggle("shortcuts"),
          moveFocus: (direction) =>
            nextRegion(document.activeElement, direction, document)?.focus(),
        },
      }),
    [shell, platform, userKeymap],
  )

  useEffect(() => {
    if (warnings.length > 0) {
      logger.warn("keyboard.conflicts", { detail: describeConflicts(warnings) })
    }
  }, [warnings])

  return (
    <KeyboardProvider commands={commands} keymap={keymap} platform={platform}>
      <PaletteScope palette={palette}>{children}</PaletteScope>
    </KeyboardProvider>
  )
}

function build({
  shell,
  app,
  platform,
  userKeymap,
  viewportStore,
}: {
  shell: ShellActions
  app: AppCommandActions
  platform: Platform
  userKeymap: UserKeymap
  /** Null until a page is open. Read on every run, never captured. */
  viewportStore: () => EditorStoreApi | null
}): {
  commands: CommandRegistry
  keymap: KeymapRegistry
  palette: PaletteRegistry
  warnings: readonly ShortcutConflict[]
} {
  const commands = new CommandRegistry()
  const keymap = new KeymapRegistry(commands)
  const palette = new PaletteRegistry()

  commands.registerAll([
    ...createShellCommands(shell),
    ...createAppCommands(app),
    ...createViewportCommands({ store: viewportStore }),
    ...createEditCommands({ store: viewportStore }),
  ])

  // Their changes applied to what the product ships: remapped keys replaced,
  // switched-off ones absent, bare character keys gone if they asked.
  keymap.registerAll(resolveShortcuts(defaultShortcuts, userKeymap))

  /*
   * Startup conflict detection.
   *
   * Errors throw, which fails the page loudly rather than leaving somebody with
   * a key that silently does the wrong thing. Warnings have a defined winner, so
   * they are logged and the shell runs.
   */
  const warnings = keymap.assertNoConflicts()

  palette.register(
    createCommandSource({
      commands,
      shortcutFor: (id) => {
        const binding = keymap.bindingFor(id)

        return binding === null ? null : keymap.format(binding, platform)
      },
    }),
  )

  return { commands, keymap, palette, warnings }
}
