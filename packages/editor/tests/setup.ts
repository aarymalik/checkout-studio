import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

/**
 * Every test gets a clean document.
 *
 * Without this, a provider left mounted by one test is still listening during
 * the next one, and a keystroke runs a command twice for reasons nothing in the
 * failing test explains.
 */
afterEach(() => {
  cleanup()
})

/**
 * What jsdom does not implement.
 *
 * The canvas observes its frame for resizes and reads boxes from the DOM.
 * jsdom has no layout, so a real ResizeObserver would have nothing to report
 * and every rect is zero — tests that need geometry stub the rect they want,
 * which is honest: a fake measurement from a fake layout engine would be worse
 * than none.
 */
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class ResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {}

    observe(): void {
      // Fired once on observe, as the real one does, so a hook that measures in
      // its callback behaves the same here.
      this.callback([], this)
    }

    unobserve(): void {}
    disconnect(): void {}
  }
}
