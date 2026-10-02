import { render, screen } from "@testing-library/react"
import { KeyboardProvider, CommandRegistry, KeymapRegistry } from "@checkout-studio/editor"
import { defaultTheme } from "@checkout-studio/schema"
import { describe, expect, it } from "vitest"
import type { ReactNode } from "react"

import { CanvasArea } from "./CanvasArea"

/**
 * What the canvas area says when it cannot show a canvas.
 *
 * Two reasons, and they are different problems: no page open, and no components
 * registered. The second is the one that matters to get right, because the
 * alternative — letting the renderer repeat a per-node "this plugin is not
 * installed" for every node — describes the wrong problem N times.
 */

function wrap(children: ReactNode) {
  const commands = new CommandRegistry()

  return (
    <KeyboardProvider commands={commands} keymap={new KeymapRegistry(commands)} platform="mac">
      {children}
    </KeyboardProvider>
  )
}

describe("CanvasArea", () => {
  it("is a landmark the keyboard can reach, whatever is inside it", () => {
    render(wrap(<CanvasArea theme={null} />))

    expect(screen.getByRole("main", { name: "Canvas" })).toBeInTheDocument()
  })

  it("asks for a page before explaining the component library", () => {
    render(wrap(<CanvasArea theme={null} />))

    // Creating a page is something the user can do. Being told the library is
    // unfinished first answers a question they have not reached yet.
    expect(screen.getByText("No page open")).toBeInTheDocument()
    expect(screen.queryByText("No components yet")).toBeNull()
  })

  it("says once that there are no components, rather than once per node", () => {
    // The registry this build ships is empty until Phase 9. A document is still
    // a perfectly good document; there is nothing that knows how to draw it.
    render(wrap(<CanvasArea theme={defaultTheme} />))

    expect(screen.getByText("No components yet")).toBeInTheDocument()
    expect(screen.queryByText(/not installed/)).toBeNull()
  })

  it("explains what does work, so it reads as unfinished rather than broken", () => {
    render(wrap(<CanvasArea theme={defaultTheme} />))

    expect(screen.getByText(/Pages, the canvas and the keyboard all work/)).toBeInTheDocument()
  })
})
