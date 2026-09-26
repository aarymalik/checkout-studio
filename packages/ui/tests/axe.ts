import axe from "axe-core"
import { expect } from "vitest"

/**
 * Runs axe over rendered output and fails with what it found.
 *
 * Colour contrast is disabled here, and only here: jsdom does not lay out or
 * composite anything, so axe cannot measure a ratio and reports every pairing
 * as "incomplete" rather than as a pass. Contrast is covered properly in
 * @checkout-studio/design-system, where every semantic pairing the product
 * renders is measured in light, dark and both at high contrast — against real
 * values rather than a guess at what the browser would compute.
 *
 * Everything else axe checks — roles, accessible names, ARIA validity, label
 * association, focus order — works in jsdom and runs on every component.
 */
export async function expectNoViolations(container: HTMLElement): Promise<void> {
  const results = await axe.run(container, {
    rules: {
      "color-contrast": { enabled: false },
      /*
       * `region` asks that all page content sit inside a landmark. That is a
       * page-structure rule and a component is not a page: it fires on every
       * portalled overlay rendered into a bare test document, and says nothing
       * about the component. The landmark structure it is really about belongs
       * to the application shell, and is asserted there.
       */
      region: { enabled: false },
    },
  })

  const summary = results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.help}\n` +
      violation.nodes.map((node) => `    ${node.html}\n    ${node.failureSummary}`).join("\n"),
  )

  expect(summary, `axe found ${summary.length} violation(s)`).toEqual([])
}
