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
