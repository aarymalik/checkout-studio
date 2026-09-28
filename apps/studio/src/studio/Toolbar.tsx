"use client"

import { PanelLeft, PanelRight, Redo2, Undo2 } from "lucide-react"
import { Button, Tooltip } from "@checkout-studio/ui"
import { useKeyboard, useShellLayout, useShellActions } from "@checkout-studio/editor"

import { useOverlays } from "./overlays"
import { Logo } from "@/components/brand/Logo"

/**
 * The top toolbar.
 *
 * Every control here runs a registered command, and a control appears only when
 * its command is registered and available. That is why there is no device
 * switcher, no zoom and no publish button yet: those commands arrive with the
 * canvas and the publishing pipeline, and a button that does nothing is worse
 * than a button that is not there.
 *
 * See docs/ui-guidelines.md § Top Toolbar and docs/phases.md, Phase 4 step 12.
 */
export function Toolbar({ projectName }: { projectName: string }) {
  const { keymap, platform, commands } = useKeyboard()
  const layout = useShellLayout()
  const actions = useShellActions()
  const overlays = useOverlays()

  function label(commandId: string, fallback: string): string {
    const binding = keymap.bindingFor(commandId)

    return binding === null ? fallback : `${fallback} · ${keymap.format(binding, platform)}`
  }

  const canUndo = commands.has("edit.undo")

  return (
    <header
      id="shell-toolbar"
      tabIndex={-1}
      aria-label="Toolbar"
      className="flex h-toolbar shrink-0 items-center gap-3 border-b border-border bg-surface px-4"
    >
      <Logo className="size-6 shrink-0" />

      <h1 className="min-w-0 truncate text-body font-medium text-foreground">{projectName}</h1>

      <div className="ml-auto flex items-center gap-1">
        <Tooltip content={label("view.toggle-left-panel", "Toggle left sidebar")}>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Toggle left sidebar"
            aria-pressed={!layout.leftCollapsed}
            onClick={() => actions.toggleLeft()}
          >
            <PanelLeft aria-hidden="true" className="size-4" />
          </Button>
        </Tooltip>

        <Tooltip content={label("view.toggle-right-panel", "Toggle inspector")}>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Toggle inspector"
            aria-pressed={!layout.rightCollapsed}
            onClick={() => actions.toggleRight()}
          >
            <PanelRight aria-hidden="true" className="size-4" />
          </Button>
        </Tooltip>

        {/*
         * Undo and redo are rendered from the registry too, so they appear the
         * moment Phase 5 registers them and stay absent until then.
         */}
        {canUndo ? (
          <>
            <Button variant="ghost" size="sm" aria-label="Undo">
              <Undo2 aria-hidden="true" className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" aria-label="Redo">
              <Redo2 aria-hidden="true" className="size-4" />
            </Button>
          </>
        ) : null}

        <Button variant="secondary" size="sm" onClick={() => overlays.show("palette")}>
          {label("help.command-palette", "Search")}
        </Button>
      </div>
    </header>
  )
}
