import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

/**
 * Every test gets a clean document. Without this, a component left mounted by
 * one test is found by the next one's queries, and a suite that passes in
 * order fails when a single test is run on its own.
 */
afterEach(() => {
  cleanup()
})

/*
 * Browser APIs jsdom does not implement.
 *
 * Every overlay in the library measures and positions itself, which means
 * asking the platform questions jsdom has no answer for. Without these, a
 * Select never opens and the failure looks like a broken component rather than
 * a missing API.
 *
 * Each one is a no-op on purpose: layout cannot be simulated, and a fake
 * measurement would be worse than none. What positioning looks like is a
 * question for the browser-driven suite; what a component announces and how it
 * responds to a keyboard is answerable here.
 */
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
}

if (!("DOMRect" in globalThis)) {
  globalThis.DOMRect = class DOMRect {
    constructor(
      readonly x = 0,
      readonly y = 0,
      readonly width = 0,
      readonly height = 0,
    ) {}
    readonly top = 0
    readonly right = 0
    readonly bottom = 0
    readonly left = 0
    toJSON(): object {
      return this
    }
    static fromRect(): DOMRect {
      return new DOMRect()
    }
  } as unknown as typeof globalThis.DOMRect
}

Element.prototype.scrollIntoView ??= function scrollIntoView(): void {}
Element.prototype.hasPointerCapture ??= function hasPointerCapture(): boolean {
  return false
}
Element.prototype.setPointerCapture ??= function setPointerCapture(): void {}
Element.prototype.releasePointerCapture ??= function releasePointerCapture(): void {}
