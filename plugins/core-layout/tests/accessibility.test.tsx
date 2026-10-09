import { describe, expect, it } from "vitest"
import { PluginHost } from "@checkout-studio/plugin-sdk"
import { CURRENT_VERSION } from "@checkout-studio/schema"

import { coreLayout } from "../src/renderer"
import { expectNoViolations } from "./axe"
import { renderComponent } from "./support"

/**
 * Every component, in every mode, against axe.
 *
 * Phase 9's exit criteria: zero violations across all components. Driven from
 * the registry rather than from a list written here, so the next component
 * added to this plugin is covered by the fact of being registered. A list
 * somebody has to remember to extend is a list that goes stale, and the going
 * stale is invisible.
 */

const registry = new PluginHost({
  versions: { engine: "0.1.0", schema: CURRENT_VERSION },
})
  .register(coreLayout)
  .startSync()

const MODES = ["published", "static", "editor-preview", "embed"] as const

describe("axe", () => {
  for (const type of registry.types()) {
    for (const mode of MODES) {
      it(`reports nothing for ${type} in ${mode}`, async () => {
        const definition = registry.get(type)

        if (definition === undefined) throw new Error(`${type} is not registered.`)

        const { container } = renderComponent(definition, {
          mode,
          // Children for the ones that hold them; the others ignore it, which
          // is itself worth exercising — a component that is not a container
          // must not render content it was handed.
          children: <p>Content a component has to hold without breaking.</p>,
          node: { children: definition.container ? ["nod_child"] : [] },
        })

        await expectNoViolations(container)
      })
    }
  }

  it("covered every component the plugin registers", () => {
    // The guard on the loop above: if the registry were empty this file would
    // pass by running nothing at all.
    expect(registry.types().length).toBeGreaterThanOrEqual(8)
  })
})
