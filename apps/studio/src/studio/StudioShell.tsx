"use client"

import {
  EditorProvider,
  useScope,
  type Platform,
  type ShellLayout,
  type UserKeymap,
} from "@checkout-studio/editor"
import type { ReactNode } from "react"
import { defaultTheme } from "@checkout-studio/schema"
import type { CheckoutSchema, CheckoutTheme } from "@checkout-studio/schema"

import { Autosave } from "./autosave/Autosave"
import { CanvasArea } from "./canvas/CanvasArea"
import { ChordHint } from "./ChordHint"
import { Inspector } from "./Inspector"
import { LayersPanel } from "./layers/LayersPanel"
import { ComponentLibrary } from "./library/ComponentLibrary"
import { PaletteHost } from "./PaletteHost"
import { ConflictPrompt } from "./conflict/ConflictPrompt"
import { EditSessionProvider } from "./session/EditSessionProvider"
import { EditorStatus } from "./session/EditorStatus"
import { TakeoverPrompt } from "./session/TakeoverPrompt"
import { Sidebar, type SidebarPanels } from "./Sidebar"
import { ProjectThemeProvider, useProjectTheme } from "./theme/ProjectTheme"
import { ThemePanel } from "./theme/ThemePanel"
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
  projectId,
  projectName,
  initialLayout,
  userKeymap,
  platform,
  panels = {},
  page = null,
}: {
  projectId: string
  projectName: string
  initialLayout: ShellLayout
  userKeymap: UserKeymap
  platform: Platform
  /** What each sidebar tab shows, for the tabs that have something to show. */
  panels?: SidebarPanels
  page?: OpenPage | null
}) {
  /**
   * @param overlays dialogs that belong inside the keyboard provider.
   *
   * They used to sit outside it, which was invisible until the canvas had
   * something to draw: a dialog declares an overlay scope so the rest of the
   * editor stops listening, and `useScope` needs the provider. Before
   * `core-layout` existed the canvas bound nothing, so nothing competed for
   * `Escape` and the omission cost nothing.
   */
  function frame(panelsForTabs: SidebarPanels, saveStatus?: ReactNode, overlays?: ReactNode) {
    /*
     * The theme is state from here down, seeded by what the server resolved.
     * The panel edits it and the canvas reads it, so it has to live above
     * both — and a round trip between them would miss the sixteen
     * milliseconds docs/theme-system.md asks a theme change to land in.
     */
    return (
      <StudioProviders initialLayout={initialLayout} userKeymap={userKeymap} platform={platform}>
        <ProjectThemeProvider projectId={projectId} initial={page?.theme ?? defaultTheme}>
          <Frame
            projectName={projectName}
            panels={{ theme: <ThemePanel />, ...panelsForTabs }}
            hasPage={page !== null}
            saveStatus={saveStatus}
          />
        </ProjectThemeProvider>
        {overlays}
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
          {/*
            Both prompts are asked rather than assumed, and both are passed in
            rather than rendered beside: they read the session for who holds the
            page and autosave for the document the server last agreed to — so
            they have to be inside those — and they declare an overlay scope, so
            they have to be inside the keyboard provider too.
          */}
          {frame(
            { components: <ComponentLibrary />, layers: <LayersPanel />, ...panels },
            <EditorStatus />,
            <>
              <TakeoverPrompt />
              <ConflictPrompt />
            </>,
          )}
        </EditSessionProvider>
      </Autosave>
    </EditorProvider>
  )
}

function Frame({
  projectName,
  panels,
  hasPage,
  saveStatus,
}: {
  projectName: string
  panels: SidebarPanels
  /** Whether there is a document to draw. A theme exists either way. */
  hasPage: boolean
  /** Passed rather than read: the store only exists when a page is open. */
  saveStatus?: ReactNode
}) {
  // Read rather than passed, so an edit in the panel reaches the canvas
  // without the frame re-rendering from the top.
  const theme = useProjectTheme()?.theme ?? null
  // Everything inside the editor is in the studio scope, which is what keeps the
  // panel shortcuts off the dashboard.
  useScope("studio")

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-background">
      <Toolbar projectName={projectName} />

      <div className="flex min-h-0 flex-1">
        <Sidebar panels={panels} />
        <CanvasArea theme={hasPage ? theme : null} />
        <Inspector theme={theme} />
      </div>

      <StatusBar status={saveStatus} />
      <ChordHint />

      <PaletteHost />
      <ShortcutReference />
    </div>
  )
}
