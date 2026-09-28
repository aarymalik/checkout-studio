import axe from "axe-core"
import { expect } from "vitest"

/**
 * Runs axe over rendered output and fails with what it found.
 *
 * Unlike the component library's helper, `region` is left on here. That rule
 * asks that all content sit inside a landmark, which is a page-structure
 * question — and the shell is the page structure. @checkout-studio/ui disables
 * it with a note saying the landmarks belong to the application and are asserted
 * there; this is there.
 *
 * Colour contrast stays off for the same reason it is off in the library: jsdom
 * does not composite, so axe cannot measure a ratio. Every pairing the product
 * renders is measured against real values in @checkout-studio/design-system.
 */
export async function expectNoViolations(container: HTMLElement): Promise<void> {
  const results = await axe.run(container, {
    rules: { "color-contrast": { enabled: false } },
  })

  const summary = results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.help}\n` +
      violation.nodes.map((node) => `    ${node.html}\n    ${node.failureSummary}`).join("\n"),
  )

  expect(summary, `axe found ${summary.length} violation(s)`).toEqual([])
}
