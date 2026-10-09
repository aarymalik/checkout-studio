import { describe, expect, it } from "vitest"
import { PluginHost } from "@checkout-studio/plugin-sdk"
import { CURRENT_VERSION } from "@checkout-studio/schema"

import { coreContent } from "../src/renderer"
import { expectNoViolations } from "./axe"
import { renderComponent } from "./support"

/**
 * Every component, in every mode, against axe.
 *
 * Phase 9's exit criteria: zero violations across all components. Driven from
 * the registry rather than from a list written here, so a component added to
 * this plugin is covered by the fact of being registered.
 *
 * A heading is rendered inside a wrapper with an `h1` above it, because axe's
 * `heading-order` rule is about a page rather than a component: a lone `h2` in
 * an empty document is a skipped level, and that is the page's problem, not the
 * heading's. The document validator in `validators.ts` is what checks the page.
 */

const registry = new PluginHost({
  versions: { engine: "0.1.0", schema: CURRENT_VERSION },
})
  .register(coreContent)
  .startSync()

const MODES = ["published", "static", "editor-preview", "embed"] as const

describe("axe", () => {
  for (const type of registry.types()) {
    for (const mode of MODES) {
      it(`reports nothing for ${type} in ${mode}`, async () => {
        const definition = registry.get(type)

        if (definition === undefined) throw new Error(`${type} is not registered.`)

        const { container } = renderComponent(definition, { mode })

        await expectNoViolations(container)
      })
    }
  }

  it("covered every component the plugin registers", () => {
    expect(registry.types().length).toBeGreaterThanOrEqual(3)
  })
})
