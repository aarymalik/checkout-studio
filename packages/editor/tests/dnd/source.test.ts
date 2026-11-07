import { describe, expect, it, vi } from "vitest"
import type { DragEvent } from "react"

import { dragSource } from "../../src/dnd/source"

/**
 * What a drag source has to say to the browser.
 *
 * Asserted here and proved in `apps/studio/e2e/assets.spec.ts`, which is the
 * only place it can be: jsdom has no native drag-and-drop, so the bug this
 * exists because of — Chromium starting its own drag and cancelling ours two
 * pixels in — cannot happen in these tests at all.
 */

describe("a drag source", () => {
  it("is not draggable by the browser's own machinery", () => {
    expect(dragSource.draggable).toBe(false)
  })

  it("refuses a drag that starts anyway", () => {
    // `draggable={false}` is not the whole answer: a picture inside the
    // element is draggable in its own right, and the event arrives from it.
    const preventDefault = vi.fn()

    dragSource.onDragStart({ preventDefault } as unknown as DragEvent<HTMLElement>)

    expect(preventDefault).toHaveBeenCalled()
  })
})
