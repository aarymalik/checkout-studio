"use client"

import { EmptyState } from "@checkout-studio/ui"
import { useKeyboard } from "@checkout-studio/editor"
import type { CheckoutTheme } from "@checkout-studio/schema"
import type { ReactElement, ReactNode } from "react"

import { Canvas } from "./Canvas"
import { registry } from "@/studio/registry"

/**
 * The canvas, or the reason there isn't one.
 *
 * Two reasons, and they are different problems with different answers.
 *
 * A project with **no pages** has nothing to draw, and drawing an empty frame
 * would suggest the page exists and is blank.
 *
 * **No components registered** is not a page problem at all: the document is
 * fine and there is nothing in the product that knows how to draw it. Saying so
 * once belongs here, because the alternative is the renderer repeating a
 * per-node "this plugin is not installed" for every node on the page — which
 * describes the wrong problem, and describes it N times.
 *
 * The landmark is the same in every case, so the keyboard reaches this region
 * whether or not there is anything in it.
 */
export function CanvasArea({ theme }: { theme: CheckoutTheme | null }): ReactElement {
  const { keymap, platform } = useKeyboard()

  // The page first, because it is the one the user can do something about.
  // Being told the component library is unfinished before being told to create
  // a page answers a question they have not reached yet.
  if (theme === null) {
    const binding = keymap.bindingFor("help.command-palette")

    return (
      <Region>
        <EmptyState
          title="No page open"
          description={
            binding === null
              ? "Create a page to start building."
              : `Create a page to start building. ${keymap.format(binding, platform)} reaches everything the studio can do.`
          }
        />
      </Region>
    )
  }

  // Read at render: a registry is built at startup from the plugins in this
  // build, and does not change while somebody is looking at it.
  if (registry.types().length === 0) {
    return (
      <Region>
        <EmptyState
          title="No components yet"
          description="The component library arrives with Phase 9. Pages, the canvas and the keyboard all work; there is simply nothing registered that knows how to draw a heading or a button, so there is nothing to put on the page."
        />
      </Region>
    )
  }

  return <Canvas theme={theme} />
}

/** The landmark, which exists whether or not there is a canvas inside it. */
function Region({ children }: { children: ReactNode }): ReactElement {
  return (
    <main
      id="shell-canvas"
      tabIndex={-1}
      aria-label="Canvas"
      className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-canvas p-8"
    >
      {children}
    </main>
  )
}
