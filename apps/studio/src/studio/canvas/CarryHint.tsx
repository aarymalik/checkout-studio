"use client"

import { labelFor, useEditorStore, useKeyboard } from "@checkout-studio/editor"
import type { ReactElement } from "react"

/**
 * What is in your hand, and what the keys do.
 *
 * Keyboard drag was built, announced and invisible. The announcement is a live
 * region, so a sighted keyboard user got nothing: the node they picked up did
 * not change, and the only mark on screen was the drop indicator — which, for a
 * node that is its parent's only child, is an outline around the whole page.
 * Somebody using the product read that as the key having done nothing.
 *
 * So this says the three things a modal gesture has to say: that you are in it,
 * what you are carrying, and how to get out. It doubles as the only place the
 * mode is discoverable at all — `M` is in the shortcut reference and nowhere a
 * user looking at a canvas would find it.
 *
 * The keys are read from the keymap rather than written here, because they are
 * remappable: a user who moved Drop to `Tab` should be told `Tab`.
 *
 * See docs/keyboard-shortcuts.md § Keyboard drag and drop.
 */
export function CarryHint(): ReactElement | null {
  const { keymap, platform } = useKeyboard()
  const drag = useEditorStore((state) => state.drag.keyboard)
  const document = useEditorStore((state) => state.document)

  if (drag === null) return null

  const node = document.nodes[drag.id]
  const key = (commandId: string, fallback: string): string => {
    const binding = keymap.bindingFor(commandId)

    return binding === null ? fallback : keymap.format(binding, platform)
  }

  return (
    <div
      /*
       * Not announced. Everything here is already in the live region, which
       * says it better: this is the same information arranged for eyes, and a
       * screen reader reading both would hear the position twice.
       */
      aria-hidden
      className="pointer-events-none flex items-center gap-2 rounded-control border border-border bg-surface px-3 py-2 text-caption text-foreground shadow-popover"
    >
      <span className="font-medium">Moving {node === undefined ? drag.id : labelFor(node)}</span>
      <Keys>
        {key("dnd.step-up", "↑")} / {key("dnd.step-down", "↓")}
      </Keys>
      <span className="text-foreground-muted">place</span>
      <Keys>{key("dnd.drop", "Enter")}</Keys>
      <span className="text-foreground-muted">drop</span>
      <Keys>{key("dnd.cancel", "Escape")}</Keys>
      <span className="text-foreground-muted">cancel</span>
    </div>
  )
}

function Keys({ children }: { children: React.ReactNode }): ReactElement {
  return (
    <kbd className="rounded-tight border border-border bg-surface-raised px-1 text-tiny text-foreground-muted">
      {children}
    </kbd>
  )
}
