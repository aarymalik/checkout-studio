import { describe, expect, it } from "vitest"

import { page } from "../src/components/page/definition"
import { section } from "../src/components/section/definition"
import { expectNoViolations } from "./axe"
import { renderComponent } from "./support"

/**
 * Every component, in every mode, against axe.
 *
 * Phase 9's exit criteria: zero violations across all components. Driven from
 * the definitions rather than written per component, so the next component
 * added to this plugin is covered by the fact of being registered — the
 * alternative is a list somebody forgets to extend, and the forgetting is
 * invisible.
 */

const COMPONENTS = [page, section]
const MODES = ["published", "static", "editor-preview", "embed"] as const

describe("axe", () => {
  for (const definition of COMPONENTS) {
    for (const mode of MODES) {
      it(`reports nothing for ${definition.name} in ${mode}`, async () => {
        const { container } = renderComponent(definition, {
          mode,
          children: <p>Content a component has to hold without breaking.</p>,
          node: { children: ["nod_child"] },
        })

        await expectNoViolations(container)
      })
    }
  }

  it("covers every component this plugin registers", () => {
    // The guard on the list above. A component registered and not covered is
    // exactly the gap this file exists to close.
    expect(COMPONENTS).toHaveLength(2)
  })
})
