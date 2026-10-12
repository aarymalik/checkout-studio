import { describe, expect, it } from "vitest"
import { PluginHost } from "@checkout-studio/plugin-sdk"
import { CURRENT_VERSION } from "@checkout-studio/schema"

import { coreEmbed } from "../src/renderer"
import { parseCss } from "../src/css/parse"
import { parseHtml } from "../src/html/parse"
import { expectNoViolations } from "./axe"
import { renderComponent } from "./support"

/**
 * Every component, in every mode, against axe.
 *
 * Phase 9's exit criteria: zero violations across all components. Driven from
 * the registry rather than from a list written here, so a component added to
 * this plugin is covered by the fact of being registered.
 *
 * Twice over for this plugin, and the second pass is the one that matters.
 * The defaults are an empty block, which has nothing for axe to object to —
 * a suite that stopped there would be reporting on a component in a state no
 * published page is in. The second pass hands each component content a
 * merchant would actually write.
 */

const registry = new PluginHost({
  versions: { engine: "0.1.0", schema: CURRENT_VERSION },
})
  .register(coreEmbed)
  .startSync()

const MODES = ["published", "static", "editor-preview", "embed"] as const

/** What a merchant's block holds, per type. */
const MERCHANT_MARKUP = [
  "<h2>Returns</h2>",
  "<p>Thirty days, <strong>no questions</strong>. Read the",
  '<a href="/terms" target="_blank">terms</a>.</p>',
  "<ul><li>Unworn</li><li>In its box</li></ul>",
  '<table><caption>Timings</caption><tr><th scope="col">Step</th><td>Days</td></tr></table>',
].join("")

const FILLED: Readonly<Record<string, Record<string, unknown>>> = {
  "core.embed": { provider: "youtube", id: "dQw4w9WgXcQ", title: "How it works" },
  "core.code-block": {
    content: parseHtml(MERCHANT_MARKUP).content,
    styles: parseCss(".lead { font-size: 18px } h2 { margin-bottom: 8px }").rules,
  },
  "core.html-block": { content: parseHtml(MERCHANT_MARKUP).content },
}

describe("axe", () => {
  for (const type of registry.types()) {
    for (const mode of MODES) {
      it(`reports nothing for ${type} in ${mode}`, async () => {
        const definition = registry.get(type)

        if (definition === undefined) throw new Error(`${type} is not registered.`)

        const { container } = renderComponent(definition, { mode })

        await expectNoViolations(container)
      })

      it(`reports nothing for ${type} in ${mode}, with content in it`, async () => {
        const definition = registry.get(type)

        if (definition === undefined) throw new Error(`${type} is not registered.`)

        const props = FILLED[type]

        if (props === undefined) throw new Error(`${type} has no filled case.`)

        const { container } = renderComponent(definition, { mode, props })

        await expectNoViolations(container)
      })
    }
  }

  it("covered every component the plugin registers", () => {
    expect([...registry.types()].sort()).toEqual(Object.keys(FILLED).sort())
  })
})
