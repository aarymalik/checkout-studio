import { describe, expect, it } from "vitest"

import { host, registry } from "./registry"

/**
 * That the plugins are actually installed in the build a customer loads.
 *
 * The studio has had this test since `core-layout` arrived and the renderer
 * application has not, which is the wrong way round: a plugin missing here is
 * a published checkout rendering unsupported placeholders to somebody holding
 * a card, and every test in every plugin would still pass. Same shape as the
 * benchmark that spent two phases measuring fixture components.
 *
 * What it is not testing is `PluginHost`, which has its own tests. It is
 * testing that this application wires it up.
 */
describe("the published registry", () => {
  it("activated every core plugin", () => {
    expect(host.records().map((record) => [record.manifest.id, record.state])).toEqual([
      ["core-layout", "active"],
      ["core-content", "active"],
      ["core-embed", "active"],
    ])
  })

  it("resolves the root type every document already has", () => {
    expect(registry.get("core.page")?.name).toBe("Page")
  })

  it("holds the same types the editor draws with", () => {
    // Not an exhaustive list: the point is that all three plugins reached it,
    // and the catalog in docs/component-library.md is the list.
    for (const type of ["core.section", "core.heading", "core.button", "core.html-block"]) {
      expect(registry.has(type), type).toBe(true)
    }
  })

  it("ships nothing that needs a client", () => {
    /*
     * Every core component renders on the server and hydrates nothing, which
     * is what keeps a published checkout at a few kilobytes. The first
     * component that needs a client is the payment element in Phase 13, and
     * when it arrives this test should say so rather than be deleted.
     */
    const interactive = registry.types().filter((type) => registry.get(type)?.interactive === true)

    expect(interactive).toEqual([])
  })
})
