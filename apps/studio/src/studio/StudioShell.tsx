"use client"

import { useScope, type Platform, type ShellLayout, type UserKeymap } from "@checkout-studio/editor"

import { CanvasArea } from "./CanvasArea"
import { ChordHint } from "./ChordHint"
import { Inspector } from "./Inspector"
import { PaletteHost } from "./PaletteHost"
import { Sidebar } from "./Sidebar"
import { ShortcutReference } from "./ShortcutReference"
import { StatusBar } from "./StatusBar"
import { StudioProviders } from "./StudioProviders"
import { Toolbar } from "./Toolbar"

/**
 * The editor frame.
 *
 * Toolbar, three columns, status bar — fixed heights top and bottom, everything
 * else given to the canvas. Nothing here edits anything: Phase 4 is the frame,
 * and the parts that fill it each arrive with their own phase.
 *
 * See docs/ui-guidelines.md § Studio Layout.
 */
export function StudioShell({
  projectName,
  initialLayout,
  userKeymap,
  platform,
}: {
  projectName: string
  initialLayout: ShellLayout
  userKeymap: UserKeymap
  platform: Platform
}) {
  return (
    <StudioProviders initialLayout={initialLayout} userKeymap={userKeymap} platform={platform}>
      <Frame projectName={projectName} />
    </StudioProviders>
  )
}

function Frame({ projectName }: { projectName: string }) {
  // Everything inside the editor is in the studio scope, which is what keeps the
  // panel shortcuts off the dashboard.
  useScope("studio")

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-background">
      <Toolbar projectName={projectName} />

      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <CanvasArea />
        <Inspector />
      </div>

      <StatusBar />
      <ChordHint />

      <PaletteHost />
      <ShortcutReference />
    </div>
  )
}
