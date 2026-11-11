import { describe, expect, it } from "vitest"

import { pluginRequirements } from "./plugins"

/**
 * What an importer has to install.
 *
 * The join between a document and the plugins behind it, which nothing can
 * make without being told — a shared namespace means a type id does not name
 * its plugin. So these are mostly about what happens when the telling is
 * incomplete.
 */

const OWNERS = new Map([
  ["core.page", "core-layout"],
  ["core.section", "core-layout"],
  ["core.image", "core-content"],
  ["shop.cart", "checkout"],
])

const INSTALLED = new Map([
  ["core-layout", "0.1.0"],
  ["core-content", "0.1.3"],
  ["checkout", "1.2.0"],
])

describe("the plugins a page needs", () => {
  it("is one requirement per plugin, whatever the version it was built against", () => {
    expect(pluginRequirements(["core.image", "core.page"], OWNERS, INSTALLED)).toEqual({
      plugins: [
        { id: "core-content", version: "^0.1.3", optional: false },
        { id: "core-layout", version: "^0.1.0", optional: false },
      ],
      unsupported: [],
    })
  })

  it("names a plugin once however many of its types are used", () => {
    const { plugins } = pluginRequirements(["core.page", "core.section"], OWNERS, INSTALLED)

    expect(plugins).toEqual([{ id: "core-layout", version: "^0.1.0", optional: false }])
  })

  it("tells apart two plugins sharing a namespace", () => {
    // The case the type id cannot answer: both are `core.*`, and they are two
    // separate things to install.
    const { plugins } = pluginRequirements(["core.image", "core.section"], OWNERS, INSTALLED)

    expect(plugins.map((entry) => entry.id)).toEqual(["core-content", "core-layout"])
  })

  it("is sorted by plugin id and not by where its types appeared", () => {
    /*
     * The input is sorted by type, which orders plugins by whichever of their
     * types sorts first. A page where two nodes swapped places would then
     * export as a different file.
     */
    const { plugins } = pluginRequirements(
      ["core.image", "core.page", "shop.cart"],
      OWNERS,
      INSTALLED,
    )

    expect(plugins.map((entry) => entry.id)).toEqual(["checkout", "core-content", "core-layout"])
  })

  it("requires every one of them, because an unsupported node is a broken page", () => {
    const { plugins } = pluginRequirements([...OWNERS.keys()], OWNERS, INSTALLED)

    expect(plugins.every((entry) => entry.optional === false)).toBe(true)
  })

  it("is empty for a page that uses nothing", () => {
    expect(pluginRequirements([], OWNERS, INSTALLED)).toEqual({ plugins: [], unsupported: [] })
  })
})

describe("a range rather than a pin", () => {
  it("admits a newer compatible version, so a bundle does not expire", () => {
    // Exported against 0.1.3 and imported into 0.1.9. Pinning would make every
    // bundle stop working the next time anything was updated.
    const { plugins } = pluginRequirements(["core.image"], OWNERS, INSTALLED)

    expect(plugins[0]?.version).toBe("^0.1.3")
  })
})

describe("a type nobody provides", () => {
  it("is named rather than quietly left out", () => {
    /*
     * A page keeps naming a plugin's types after the plugin is uninstalled.
     * Dropping the type would export a bundle that imports cleanly and renders
     * a hole, with nothing anywhere saying what is missing.
     */
    expect(pluginRequirements(["core.page", "ghost.widget"], OWNERS, INSTALLED)).toEqual({
      plugins: [{ id: "core-layout", version: "^0.1.0", optional: false }],
      unsupported: ["ghost.widget"],
    })
  })

  it("counts a plugin that is known but not installed", () => {
    // The host knows `checkout` registered it; this installation does not have
    // it. One outcome either way: there is no version to require.
    const withoutCheckout = new Map([["core-layout", "0.1.0"]])

    expect(pluginRequirements(["shop.cart"], OWNERS, withoutCheckout)).toEqual({
      plugins: [],
      unsupported: ["shop.cart"],
    })
  })

  it("does not stop the ones that are", () => {
    const { plugins, unsupported } = pluginRequirements(
      ["core.image", "ghost.widget", "core.page"],
      OWNERS,
      INSTALLED,
    )

    expect(plugins).toHaveLength(2)
    expect(unsupported).toEqual(["ghost.widget"])
  })
})
