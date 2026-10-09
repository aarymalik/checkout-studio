import { describe, expect, it } from "vitest"

import { host, registry } from "./registry"

/**
 * That the plugins are actually installed in this build.
 *
 * The thing worth testing is not that `PluginHost` works — plugin-sdk has
 * tests for that — but that this application wires it up. Ten features in this
 * project were built, tested and reached by nothing, and a plugin registered in
 * a test harness while the product ships an empty registry is exactly that
 * shape: every page would render as unsupported placeholders and every test
 * would pass.
 */
describe("the studio's registry", () => {
  it("activated both core plugins", () => {
    expect(host.records().map((record) => [record.manifest.id, record.state])).toEqual([
      ["core-layout", "active"],
      ["core-content", "active"],
    ])
  })

  it("let them share the core namespace without replacing each other", () => {
    /*
     * Two plugins, one namespace, which docs/component-library.md requires and
     * the host allows only because each declares it. A duplicate type id would
     * still be refused, so the second plugin added to `core.*` and replaced
     * nothing in it — the test for that rule is in plugin-sdk.
     */
    expect(registry.has("core.section")).toBe(true)
    expect(registry.has("core.heading")).toBe(true)
  })

  it("carries a plugin's document rules into the registry too", () => {
    // Heading order is a page-level rule, so it arrives as a document
    // validator rather than on a component.
    expect(registry.documentValidators().map((entry) => entry.rule)).toEqual([
      "core-content.heading-order",
    ])
  })

  it("resolves the root type every document already has", () => {
    // `core.page` is `ROOT_TYPE` in packages/schema. Until this plugin existed,
    // every document's root fell through to the unsupported fallback.
    expect(registry.get("core.page")?.name).toBe("Page")
  })

  it("resolves Section", () => {
    expect(registry.get("core.section")?.container).toBe(true)
  })

  it("keeps the page out of what a user can insert", () => {
    expect(registry.get("core.page")?.insertable).toBe(false)
    expect(registry.get("core.section")?.insertable).toBeUndefined()
  })
})
