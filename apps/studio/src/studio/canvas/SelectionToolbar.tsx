"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { ReactElement } from "react"
import { ChevronDown, ChevronUp, Copy, EyeOff, Lock, LockOpen, Trash2 } from "lucide-react"
import type { ComponentType } from "react"
import { isTextEntry, useEditorStore, useKeyboard } from "@checkout-studio/editor"
import type { Rect } from "@checkout-studio/editor"
import { Tooltip, cn } from "@checkout-studio/ui"

/**
 * The inline selection toolbar.
 *
 * Above the selection, per docs/editor-behavior.md § Inline Toolbar, holding
 * the handful of actions that apply to any component whatever it is: duplicate,
 * delete, move, lock and hide.
 *
 * Every button runs a registered command and nothing else. That is the whole
 * design: the keystroke, the palette, a future context menu and this are four
 * ways to reach one definition, and a toolbar that called the store itself
 * would be a fifth implementation of locking and the first to disagree with the
 * rest. It also means the disabled states are not this component's opinion —
 * a locked node offers no Move or Delete because the commands say they are
 * unavailable, which is the same answer the keyboard gets.
 *
 * ## What is not here
 *
 * The specification also lists "Responsive". Responsive overrides are property
 * editing, which docs/phases.md puts in Phase 12 and names explicitly as out of
 * scope for this phase — there is nothing for a button to open. Switching which
 * breakpoint is being edited already exists, in the top toolbar where it
 * applies to the page rather than to one node. A sixth button here would either
 * do nothing or duplicate that one.
 */

/** Toolbar height plus the gap, which is how far above the selection it sits. */
const OFFSET = 44

/** Below the selection instead, when there is no room above. */
const FLIP_BELOW = 8

interface Action {
  commandId: string
  /** Falls back to the command's own title. */
  label?: string
  icon: ComponentType<{ className?: string }>
  /** The icon and label to use while the command reports itself active. */
  activeIcon?: ComponentType<{ className?: string }>
  activeLabel?: string
  /** Whether the button carries a pressed state for assistive technology. */
  toggle?: boolean
}

const ACTIONS: readonly Action[] = [
  { commandId: "arrange.move-up", label: "Move up", icon: ChevronUp },
  { commandId: "arrange.move-down", label: "Move down", icon: ChevronDown },
  { commandId: "edit.duplicate", label: "Duplicate", icon: Copy },
  {
    commandId: "arrange.lock",
    label: "Lock",
    activeLabel: "Unlock",
    icon: LockOpen,
    activeIcon: Lock,
    toggle: true,
  },
  /*
   * Hide is one-way here, and not a toggle.
   *
   * docs/editor-behavior.md § Hide: a hidden component remains in Layers, is
   * **not rendered**, and can be restored. Not rendered means it has no box,
   * so the toolbar — which is positioned from the selection's box — is gone
   * the moment the press lands. A button advertising `aria-pressed` and a
   * "Show" label that can never appear is a control claiming to do something
   * it cannot, and the `activeLabel` and `activeIcon` behind it were
   * unreachable code.
   *
   * Restoring is the layers panel's, which is where a hidden node still is.
   */
  { commandId: "arrange.hide", label: "Hide", icon: EyeOff },
  { commandId: "edit.delete", label: "Delete", icon: Trash2 },
]

export interface SelectionToolbarProps {
  /** The primary selection's box, in screen space. Null when nothing is selected. */
  rect: Rect | null
  /** How tall the surface is, which decides whether the toolbar flips below. */
  surfaceHeight: number
}

export function SelectionToolbar({
  rect,
  surfaceHeight,
}: SelectionToolbarProps): ReactElement | null {
  const { commands, keymap, platform, run } = useKeyboard()
  const selectionCount = useEditorStore((state) => state.selection.ids.length)
  const isDirty = useEditorStore((state) => state.persistence.status !== "saved")
  const canEdit = useEditorStore((state) => state.persistence.canEdit)
  /*
   * Which button holds the toolbar's single tab stop.
   *
   * The WAI-ARIA toolbar pattern: one stop for the whole group, arrow keys
   * between the buttons inside it. Six tab stops per selection would make Tab
   * useless for anything else.
   */
  const [focused, setFocused] = useState(0)
  const container = useRef<HTMLDivElement>(null)

  const context = useCallback(
    () => ({
      scopes: ["global", "studio", "canvas", "canvas.selection"],
      selectionCount,
      isDirty,
      // Derived from focus rather than tracked, the same way the keyboard
      // dispatcher derives it: the element with focus is the truth.
      isEditingText: isTextEntry(document.activeElement),
    }),
    [selectionCount, isDirty],
  )

  const available = ACTIONS.filter((action) => commands.has(action.commandId))

  /*
   * Keep the tab stop on a button that is still there.
   *
   * The set shrinks — locking a node removes Move and Delete — and a stop left
   * past the end is a Tab that lands on nothing.
   */
  useEffect(() => {
    setFocused((current) => (current < available.length ? current : 0))
  }, [available.length])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const last = available.length - 1
      const next =
        event.key === "ArrowRight"
          ? Math.min(last, focused + 1)
          : event.key === "ArrowLeft"
            ? Math.max(0, focused - 1)
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? last
                : null

      if (next === null) return

      event.preventDefault()
      setFocused(next)
      container.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus()
    },
    [available.length, focused],
  )

  // Nothing selected, no page, or a session that may only read: there is
  // nothing for any of these buttons to do.
  if (rect === null || selectionCount === 0 || !canEdit || available.length === 0) return null

  const above = rect.y >= OFFSET
  const top = above ? rect.y - OFFSET : Math.min(rect.y + rect.height + FLIP_BELOW, surfaceHeight)

  return (
    <div
      ref={container}
      role="toolbar"
      aria-label="Selection"
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      /*
       * The toolbar owns its pointer, and has to say so.
       *
       * It is drawn inside the canvas's gesture surface, so without this a
       * press on Delete also reached the surface's own `onPointerDown`: the
       * button is not a node, so the canvas started a marquee, and the empty
       * marquee cleared the selection on release. The click then ran against
       * nothing selected, and every command declined — a row of buttons that
       * looked enabled and did nothing.
       *
       * The resize grips already do this, with the same reasoning in the same
       * words, and the breadcrumb avoids it by being rendered outside the
       * surface entirely. This was the one control inside it that had neither.
       */
      onPointerDown={(event) => event.stopPropagation()}
      className="pointer-events-auto absolute flex items-center gap-1 rounded-control border border-border bg-surface p-1 shadow-popover"
      style={{ left: rect.x, top }}
    >
      {available.map((action, index) => {
        const command = commands.get(action.commandId)
        const active = command?.isActive?.(context()) ?? false
        const enabled = command?.isAvailable(context()) ?? false
        const Icon = (active ? action.activeIcon : action.icon) ?? action.icon
        /*
         * An action with no `activeLabel` keeps its own label when it is
         * active. The first version fell through to the command's title
         * instead, which is how Hide stopped being called Hide the moment it
         * had hidden something: `arrange.hide`'s title is "Hide / show".
         */
        const label =
          (active ? (action.activeLabel ?? action.label) : action.label) ?? command?.title ?? ""
        const binding = keymap.bindingFor(action.commandId)

        return (
          <Tooltip
            key={action.commandId}
            content={binding === null ? label : `${label} · ${keymap.format(binding, platform)}`}
          >
            <button
              type="button"
              aria-label={label}
              {...(action.toggle === true ? { "aria-pressed": active } : {})}
              /*
               * `aria-disabled`, not `disabled`.
               *
               * A disabled button cannot take focus, which dead-ends the arrow
               * navigation: with the last child selected, Move down has nowhere
               * to go, and a `disabled` attribute there stopped the roving tab
               * index from ever reaching Lock. It also hides the control from
               * assistive technology instead of announcing it as unavailable —
               * and this project's rule is that an unavailable command is
               * "shown greyed rather than hidden, so the interface does not
               * rearrange itself as selection changes".
               */
              aria-disabled={!enabled}
              // One tab stop for the group; the arrows move within it.
              tabIndex={index === focused ? 0 : -1}
              onFocus={() => setFocused(index)}
              onClick={() => {
                // The command would decline anyway; not calling it keeps the
                // press from reaching history as a no-op.
                if (enabled && command !== null) run(command.id, context(), "toolbar")
              }}
              className={cn(
                "flex size-7 items-center justify-center rounded-tight text-foreground-muted transition-colors duration-fast",
                "focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:outline-none",
                enabled
                  ? "hover:bg-surface-raised hover:text-foreground"
                  : "cursor-default opacity-40",
                active && "text-foreground",
              )}
            >
              <Icon aria-hidden="true" className="size-4" />
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}
