"use client"

import {
  EditorProvider,
  useScope,
  type Platform,
  type ShellLayout,
  type UserKeymap,
} from "@checkout-studio/editor"
import type { ReactNode } from "react"
import type { CheckoutSchema, CheckoutTheme } from "@checkout-studio/schema"

import { Autosave } from "./autosave/Autosave"
import { CanvasArea } from "./canvas/CanvasArea"
import { ChordHint } from "./ChordHint"
import { Inspector } from "./Inspector"
import { LayersPanel } from "./layers/LayersPanel"
import { PaletteHost } from "./PaletteHost"
import { EditSessionProvider } from "./session/EditSessionProvider"
import { EditorStatus } from "./session/EditorStatus"
import { Sidebar, type SidebarPanels } from "./Sidebar"
import { ShortcutReference } from "./ShortcutReference"
import { StatusBar } from "./StatusBar"
import { StudioProviders } from "./StudioProviders"
import { Toolbar } from "./Toolbar"

/**
 * The editor frame.
 *
 * Toolbar, three columns, status bar — fixed heights top and bottom, everything
 * else given to the canvas.
 *
 * The store is mounted here rather than inside the canvas, because the layers
 * panel, the inspector and the status bar all read the same document — and one
 * store per editor is what keeps a selection made on the canvas visible in the
 * panel beside it.
 *
 * See docs/ui-guidelines.md § Studio Layout.
 */

/** The page being edited, or null when the project has none. */
export interface OpenPage {
  document: CheckoutSchema
  /** Resolved from the project's theme records, server-side. */
  theme: CheckoutTheme
  /** The draft version this session started from, which conflict detection needs. */
  baseVersion: number
}
export function StudioShell({
  projectName,
  initialLayout,
  userKeymap,
  platform,
  panels = {},
  page = null,
}: {
  projectName: string
  initialLayout: ShellLayout
  userKeymap: UserKeymap
  platform: Platform
  /** What each sidebar tab shows, for the tabs that have something to show. */
  panels?: SidebarPanels
  page?: OpenPage | null
}) {
  function frame(panelsForTabs: SidebarPanels, saveStatus?: ReactNode) {
    return (
      <StudioProviders initialLayout={initialLayout} userKeymap={userKeymap} platform={platform}>
        <Frame
          projectName={projectName}
          panels={panelsForTabs}
          theme={page?.theme ?? null}
          saveStatus={saveStatus}
        />
      </StudioProviders>
    )
  }

  // No page, no store. A store built around a document that does not exist
  // would have to invent one, and every panel reading it would show somebody a
  // page they never created.
  if (page === null) return frame(panels)

  /*
   * Three layers, and the order is the dependency order.
   *
   * The store first, because everything else reads it. Autosave next, because
   * losing the edit lock has to flush before it goes read-only. The session
   * last, so it can reach that flush.
   */
  return (
    <EditorProvider document={page.document} baseVersion={page.baseVersion}>
      <Autosave document={page.document}>
        <EditSessionProvider pageId={page.document.pageId}>
          {/*
            The layers panel is supplied here rather than by the caller, because
            this is what knows whether the store exists: it reads the document
            and nothing else, and outside the provider it would throw rather
            than render the empty state the caller intended.
          */}
          {frame({ layers: <LayersPanel />, ...panels }, <EditorStatus />)}
        </EditSessionProvider>
      </Autosave>
    </EditorProvider>
  )
}

function Frame({
  projectName,
  panels,
  theme,
  saveStatus,
}: {
  projectName: string
  panels: SidebarPanels
  theme: CheckoutTheme | null
  /** Passed rather than read: the store only exists when a page is open. */
  saveStatus?: ReactNode
}) {
  // Everything inside the editor is in the studio scope, which is what keeps the
  // panel shortcuts off the dashboard.
  useScope("studio")

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-background">
      <Toolbar projectName={projectName} />

      <div className="flex min-h-0 flex-1">
        <Sidebar panels={panels} />
        <CanvasArea theme={theme} />
        <Inspector />
      </div>

      <StatusBar status={saveStatus} />
      <ChordHint />

      <PaletteHost />
      <ShortcutReference />
    </div>
  )
}
