"use client"

import { EmptyState } from "@checkout-studio/ui"
import { useKeyboard } from "@checkout-studio/editor"
import type { CheckoutTheme } from "@checkout-studio/schema"
import type { ReactElement } from "react"

import { Canvas } from "./Canvas"

/**
 * The canvas, or the reason there isn't one.
 *
 * A project with no pages has nothing to draw, and drawing an empty frame would
 * suggest the page exists and is blank. The landmark is the same either way, so
 * the keyboard reaches this region whether or not there is a page in it.
 */
export function CanvasArea({ theme }: { theme: CheckoutTheme | null }): ReactElement {
  const { keymap, platform } = useKeyboard()

  if (theme !== null) return <Canvas theme={theme} />

  const binding = keymap.bindingFor("help.command-palette")

  return (
    <main
      id="shell-canvas"
      tabIndex={-1}
      aria-label="Canvas"
      className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-canvas p-8"
    >
      <EmptyState
        title="No page open"
        description={
          binding === null
            ? "Create a page to start building."
            : `Create a page to start building. ${keymap.format(binding, platform)} reaches everything the studio can do.`
        }
      />
    </main>
  )
}
