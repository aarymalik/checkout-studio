"use client"

import { PanelLeft, PanelRight, Redo2, Undo2 } from "lucide-react"
import { Button, Tooltip, cn } from "@checkout-studio/ui"
import type { ComponentType, ReactElement } from "react"
import {
  useEditorStore,
  useKeyboard,
  useOptionalEditorStoreApi,
  useShellLayout,
  useShellActions,
} from "@checkout-studio/editor"

import { useOverlays } from "./overlays"
import { ViewportControls } from "./ViewportControls"
import { Logo } from "@/components/brand/Logo"

/**
 * The top toolbar.
 *
 * Every control here runs a registered command, and a control appears only when
 * its command is registered and available. That is why there is no publish
 * button yet: it arrives with the publishing pipeline, and a button that does
 * nothing is worse than a button that is not there.
 *
 * The device and zoom controls follow the same rule one step further — they
 * need a document as well as a command, so they are absent with no page open
 * rather than being a row of controls over nothing.
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

  /*
   * Rendered from the registry, which is what the comment above promises.
   *
   * These were behind this check for three phases while nothing registered an
   * `edit` command, so the buttons never appeared and `⌘Z` did nothing.
   */
  const hasHistory = commands.has("edit.undo")
  // Null with no page open. The viewport controls read the document's zoom and
  // breakpoint, so without one there is nothing for them to show.
  const hasDocument = useOptionalEditorStoreApi() !== null

  return (
    <header
      id="shell-toolbar"
      tabIndex={-1}
      aria-label="Toolbar"
      className="flex h-toolbar shrink-0 items-center gap-3 border-b border-border bg-surface px-4"
    >
      <Logo className="size-6 shrink-0" />

      <h1 className="min-w-0 truncate text-body font-medium text-foreground">{projectName}</h1>

      {hasDocument ? (
        <div className="ml-auto flex items-center gap-3">
          <ViewportControls />
        </div>
      ) : null}

      <div className={cn("flex items-center gap-1", hasDocument ? "" : "ml-auto")}>
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
          A document as well as a command: the buttons read the history, and
          there is none without a page open.
        */}
        {hasDocument && hasHistory ? (
          <>
            <HistoryButton
              commandId="edit.undo"
              label={label("edit.undo", "Undo")}
              name="Undo"
              icon={Undo2}
            />
            <HistoryButton
              commandId="edit.redo"
              label={label("edit.redo", "Redo")}
              name="Redo"
              icon={Redo2}
            />
          </>
        ) : null}

        <Button variant="secondary" size="sm" onClick={() => overlays.show("palette")}>
          {label("help.command-palette", "Search")}
        </Button>
      </div>
    </header>
  )
}

/**
 * Undo or redo, from the registry.
 *
 * Disabled rather than hidden when there is nothing to undo: a control that
 * came and went as the history filled would move the buttons beside it, and
 * greying it says "nothing to undo" where absence says nothing at all.
 */
function HistoryButton({
  commandId,
  label,
  name,
  icon: Icon,
}: {
  commandId: string
  label: string
  name: string
  icon: ComponentType<{ className?: string }>
}): ReactElement | null {
  const { commands } = useKeyboard()
  // Subscribed so the button enables the moment there is something to undo.
  const depth = useEditorStore((state) =>
    commandId === "edit.undo" ? state.history.past.length : state.history.future.length,
  )

  const command = commands.get(commandId)

  if (command === null) return null

  return (
    <Tooltip content={label}>
      <Button
        variant="ghost"
        size="sm"
        aria-label={name}
        disabled={depth === 0}
        onClick={() =>
          void command.run({
            scopes: ["studio"],
            selectionCount: 0,
            isEditingText: false,
            isDirty: false,
          })
        }
      >
        <Icon aria-hidden="true" className="size-4" />
      </Button>
    </Tooltip>
  )
}
