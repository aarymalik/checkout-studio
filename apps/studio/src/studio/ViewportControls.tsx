"use client"

import { Minus, Monitor, Plus, Smartphone, Tablet } from "lucide-react"
import type { ComponentType, ReactElement } from "react"
import { BREAKPOINTS, type Breakpoint } from "@checkout-studio/schema"
import { useEditorStore, useKeyboard } from "@checkout-studio/editor"
import { Button, Tooltip, cn } from "@checkout-studio/ui"

/**
 * Zoom, and which device the page is being edited at.
 *
 * Every control here runs a registered command. The buttons are a second way to
 * reach what the keyboard and the palette already reach — not a third
 * implementation of it — which is what keeps the three from drifting.
 *
 * Rendered only when the commands exist and are available, so it is absent with
 * no page open rather than being a row of controls over nothing.
 *
 * See docs/ui-guidelines.md § Top Toolbar and docs/keyboard-shortcuts.md
 * § Canvas & Viewport.
 */

const DEVICES: Record<Breakpoint, { label: string; icon: ComponentType<{ className?: string }> }> =
  {
    desktop: { label: "Desktop", icon: Monitor },
    tablet: { label: "Tablet", icon: Tablet },
    mobile: { label: "Mobile", icon: Smartphone },
  }

export function ViewportControls(): ReactElement | null {
  const { commands, keymap, platform } = useKeyboard()
  const zoom = useEditorStore((state) => state.viewport.zoom)
  const breakpoint = useEditorStore((state) => state.viewport.breakpoint)

  // The registry is the source of truth for what exists. A control for a
  // command that is not registered is a button that does nothing.
  if (!commands.has("view.zoom-in")) return null

  function hint(id: string, fallback: string): string {
    const binding = keymap.bindingFor(id)

    return binding === null ? fallback : `${fallback} · ${keymap.format(binding, platform)}`
  }

  function run(id: string): void {
    void commands.get(id)?.run({
      scopes: ["studio"],
      selectionCount: 0,
      isEditingText: false,
      isDirty: false,
    })
  }

  return (
    <>
      <div
        role="group"
        aria-label="Device"
        className="flex items-center gap-1 rounded-control bg-surface-raised p-1"
      >
        {BREAKPOINTS.map((device) => {
          const { label, icon: Icon } = DEVICES[device]
          const id = `view.device.${device}`
          const active = breakpoint === device

          return (
            <Tooltip key={device} content={hint(id, `Edit at ${label.toLowerCase()}`)}>
              <Button
                variant="ghost"
                size="sm"
                aria-label={label}
                // A toggle group: which one is on is the state, and a screen
                // reader needs that said rather than inferred from a colour.
                aria-pressed={active}
                onClick={() => run(id)}
                className={cn(active && "bg-surface text-foreground")}
              >
                <Icon aria-hidden="true" className="size-4" />
              </Button>
            </Tooltip>
          )
        })}
      </div>

      <div role="group" aria-label="Zoom" className="flex items-center gap-1">
        <Tooltip content={hint("view.zoom-out", "Zoom out")}>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Zoom out"
            onClick={() => run("view.zoom-out")}
          >
            <Minus aria-hidden="true" className="size-4" />
          </Button>
        </Tooltip>

        {/*
          The percentage is the button, because the number is what somebody
          looks at before deciding to reset it — and a separate label plus a
          reset button says the same thing twice.
        */}
        <Tooltip content={hint("view.zoom-reset", "Zoom to 100%")}>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Zoom, ${Math.round(zoom * 100)} percent. Reset to 100%`}
            onClick={() => run("view.zoom-reset")}
            className="min-w-14 tabular-nums"
          >
            {Math.round(zoom * 100)}%
          </Button>
        </Tooltip>

        <Tooltip content={hint("view.zoom-in", "Zoom in")}>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Zoom in"
            onClick={() => run("view.zoom-in")}
          >
            <Plus aria-hidden="true" className="size-4" />
          </Button>
        </Tooltip>
      </div>
    </>
  )
}
