import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

import "@testing-library/jest-dom/vitest"

/**
 * Unmount between tests.
 *
 * Without this, a provider from one test is still mounted during the next, and
 * tests start passing or failing for reasons nothing in them explains. Learned
 * the hard way in Phase 5.
 */
afterEach(() => {
  cleanup()
})
