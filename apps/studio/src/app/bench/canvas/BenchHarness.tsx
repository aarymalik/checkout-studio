"use client"

import { useMemo } from "react"
import type { ReactElement } from "react"
import {
  CommandRegistry,
  EditorProvider,
  KeyboardProvider,
  KeymapRegistry,
  createArrangeCommands,
  createEditCommands,
  createViewportCommands,
  defaultShortcuts,
  resolveShortcuts,
  DEFAULT_KEYMAP,
  ShellProvider,
  useEditorStoreApi,
  type EditorStoreApi,
} from "@checkout-studio/editor"
import { defaultTheme } from "@checkout-studio/schema"
import { TooltipProvider } from "@checkout-studio/ui"

import { Canvas } from "@/studio/canvas/Canvas"
import { fixtureRegistry } from "@/studio/canvas/fixtures"
import { LayersPanel } from "@/studio/layers/LayersPanel"

import { benchDocument } from "./document"

/**
 * The canvas, with a page big enough to measure.
 *
 * Phase 7's exit criteria are numbers — sixty frames a second while panning and
 * zooming two thousand nodes, selection feedback inside sixteen milliseconds,
 * the layers panel under a hundred — and none of them can be measured in jsdom,
 * which has no layout and no frames. So this mounts the real canvas in a real
 * browser and lets the benchmark drive it.
 *
 * Not the application's shell. Deliberately: a benchmark that also rendered the
 * toolbar, the sidebar and the status bar would be measuring those too, and a
 * regression in any of them would read as a canvas regression.
 *
 * Exposed on `window` so the benchmark can act on the store directly rather
 * than through controls whose own cost it would then be measuring.
 */

declare global {
  interface Window {
    __bench?: { store: EditorStoreApi; nodes: readonly string[] }
  }
}

export function BenchHarness({ count, panel }: { count: number; panel: boolean }): ReactElement {
  const document = useMemo(() => benchDocument(count), [count])
  // Once: the renderer memoises component resolution on this object.
  const registry = useMemo(fixtureRegistry, [])

  return (
    <EditorProvider document={document} baseVersion={1}>
      <ShellProvider>
        <Expose />
        <Keyboard>
          <TooltipProvider>
            <div className="flex h-dvh">
              {panel ? (
                <div className="flex w-panel-default shrink-0 flex-col border-r border-border p-3">
                  <LayersPanel />
                </div>
              ) : null}
              {/*
                The same fixtures the canvas tests register, which is what
                docs/phases.md asks for: one set of components serving both, so
                a benchmark and a test cannot disagree about what a component
                is. The shipped registry is empty until the library lands, and
                measuring two thousand "not installed" placeholders would
                measure the wrong thing.
              */}
              <Canvas theme={defaultTheme} registry={registry} />
            </div>
          </TooltipProvider>
        </Keyboard>
      </ShellProvider>
    </EditorProvider>
  )
}

/** The commands the canvas's own shortcuts need, and nothing else. */
function Keyboard({ children }: { children: ReactElement }): ReactElement {
  const store = useEditorStoreApi()
  const { commands, keymap } = useMemo(() => {
    const registry = new CommandRegistry()
    const keys = new KeymapRegistry(registry)

    registry.registerAll([
      ...createViewportCommands({ store: () => store }),
      ...createEditCommands({ store: () => store }),
      ...createArrangeCommands({ store: () => store }),
    ])
    keys.registerAll(
      resolveShortcuts(defaultShortcuts, DEFAULT_KEYMAP).filter(
        (registration) => registration.scope === "canvas" || registration.scope === "studio",
      ),
    )

    return { commands: registry, keymap: keys }
  }, [store])

  return (
    <KeyboardProvider commands={commands} keymap={keymap} platform="other">
      {children}
    </KeyboardProvider>
  )
}

function Expose(): null {
  const store = useEditorStoreApi()

  if (typeof window !== "undefined") {
    const document = store.getState().document

    window.__bench = {
      store,
      nodes: Object.keys(document.nodes).filter((id) => id !== document.root),
    }
  }

  return null
}
