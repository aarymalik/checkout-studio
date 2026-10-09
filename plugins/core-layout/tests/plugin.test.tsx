import { describe, expect, it } from "vitest"
import { PluginHost, propertyDefinitions } from "@checkout-studio/plugin-sdk"
import { CURRENT_VERSION, ROOT_TYPE } from "@checkout-studio/schema"

import { manifest } from "../src/index"
import { coreLayout } from "../src/renderer"
import { coreLayoutProperties } from "../src/editor"

/**
 * The plugin, through the host.
 *
 * Phase 9's integration tests: registered on load, resolvable by the renderer,
 * every property definition valid, and everything gone again when the host
 * stops. Driven through `PluginHost` rather than by calling `activate` with a
 * stub, because the arrangement being tested is the real one — a plugin that
 * only works when we hold the api ourselves is a plugin that will not work.
 */

const VERSIONS = { engine: "0.1.0", schema: CURRENT_VERSION }

function started() {
  const host = new PluginHost({ versions: VERSIONS }).register(coreLayout)

  return { host, registry: host.startSync() }
}

describe("activation", () => {
  it("registers every component it ships", () => {
    const { host, registry } = started()

    expect(host.records().map((record) => record.state)).toEqual(["active"])

    // In registration order, and the page first: it is every document's root
    // and the one a missing registration is most visible in.
    expect([...registry.types()]).toEqual([
      "core.page",
      "core.section",
      "core.container",
      "core.grid",
      "core.stack",
      "core.columns",
      "core.spacer",
      "core.divider",
    ])
  })

  it("registers into the core namespace it declares, not its own id", () => {
    /*
     * The plugin id is `core-layout` and the catalog's type ids are `core.*`.
     * docs/component-library.md holds that the `core` namespace is shared by
     * the `core-*` plugins, so the manifest declares it — without that, the
     * host scopes the plugin to `core-layout` and refuses `core.section` as a
     * foreign namespace.
     */
    expect(manifest.namespace).toBe("core")

    const { registry } = started()

    expect(registry.has("core.section")).toBe(true)
  })

  it("answers for the root type the schema creates", () => {
    const { registry } = started()

    expect(registry.has(ROOT_TYPE)).toBe(true)
  })

  it("is resolvable with a renderer, which is what the engine needs of it", () => {
    const { registry } = started()

    expect(typeof registry.get("core.section")?.renderer).toBe("function")
  })

  it("activates synchronously, because an application builds its registry at module scope", () => {
    expect(coreLayout.activate.length).toBeLessThanOrEqual(1)
    expect(started().host.records()[0]?.state).toBe("active")
  })
})

describe("stopping", () => {
  it("leaves nothing registered", async () => {
    const { host } = started()

    await host.stop()

    expect(host.records().map((record) => record.state)).toEqual(["registered"])
    expect(host.current()).toBeNull()
  })
})

describe("the editor half", () => {
  it("has property definitions for every component the renderer half registers", () => {
    const { registry } = started()

    // A component with no property definitions is a component the inspector
    // will render an empty panel for, and nothing else would report it.
    for (const type of registry.types()) {
      expect(coreLayoutProperties.has(type)).toBe(true)
    }
  })

  it("validates every one of them against the schema", () => {
    // Phase 9's integration requirement. `defineProperties` already parses at
    // module scope, so this is the test that it was actually used.
    for (const definitions of coreLayoutProperties.values()) {
      expect(() => propertyDefinitions.parse(definitions)).not.toThrow()
    }
  })

  it("is not reachable from the renderer half", async () => {
    /*
     * The split that keeps a published checkout from downloading an
     * inspector's worth of metadata. Asserted on the module graph rather than
     * on the bundle: `scripts/check-renderer-bundle.mjs` measures the bytes,
     * and this says which import would have put them there.
     */
    const renderer = await import("../src/renderer")

    expect(Object.keys(renderer)).not.toContain("coreLayoutProperties")
  })
})
