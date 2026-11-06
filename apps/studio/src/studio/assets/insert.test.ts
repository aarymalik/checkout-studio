import { RegistryBuilder } from "@checkout-studio/plugin-sdk"
import type { ComponentDefinition, RendererRegistry } from "@checkout-studio/plugin-sdk"
import { describe, expect, it } from "vitest"

import { registry } from "../registry"
import { insertionForAsset } from "./insert"

/**
 * What a picture dragged onto the canvas becomes.
 *
 * Against the registry the build actually ships, because the answer is the
 * installed plugins' and not this module's: a table written here would go on
 * agreeing with itself after the catalog moved underneath it. The stub below
 * is for the questions the real registry cannot ask — a product with no
 * component for pictures at all.
 */

function stub(...components: readonly ComponentDefinition[]): RendererRegistry {
  const builder = new RegistryBuilder("test")

  for (const component of components) builder.component(component)

  return builder.build()
}

function component(overrides: Partial<ComponentDefinition>): ComponentDefinition {
  return {
    type: "test.thing",
    name: "Thing",
    category: "Media",
    interactive: false,
    container: false,
    defaultProps: {},
    defaultStyles: {},
    renderer: () => null,
    ...overrides,
  }
}

describe("against the components this build ships", () => {
  it("makes an Image out of a photograph, already pointing at it", () => {
    expect(insertionForAsset(registry, { id: "ast_hero", kind: "image" })).toEqual({
      type: "core.image",
      props: { src: { $asset: "ast_hero" } },
    })
  })

  it("makes one out of an SVG too", () => {
    // Both are things a browser draws in an `<img>`. The alternative for a
    // logo would be no answer at all.
    expect(insertionForAsset(registry, { id: "ast_logo", kind: "vector" })).toEqual({
      type: "core.image",
      props: { src: { $asset: "ast_logo" } },
    })
  })

  it("makes a Video out of a video", () => {
    expect(insertionForAsset(registry, { id: "ast_clip", kind: "video" })).toEqual({
      type: "core.video",
      props: { src: { $asset: "ast_clip" } },
    })
  })

  it.each(["font", "document"] as const)("makes nothing out of a %s", (kind) => {
    // Nothing on a page *is* a font. The drag then lands nowhere, which is
    // what the canvas already does with a drag it cannot place.
    expect(insertionForAsset(registry, { id: "ast_other", kind })).toBeNull()
  })

  it("makes nothing out of a kind this release no longer permits", () => {
    // A row stored under an older allowlist. It is in the library and it is
    // not something this build knows how to put on a page.
    expect(insertionForAsset(registry, { id: "ast_old", kind: null })).toBeNull()
  })
})

describe("the answer comes from the registry", () => {
  it("is nothing when no installed component shows that kind", () => {
    /*
     * A product with no Image — a form builder, say. The engine has no
     * opinion about what a picture becomes, and this is what that looks like
     * from here rather than a crash or a guess.
     */
    expect(insertionForAsset(stub(component({})), { id: "ast_hero", kind: "image" })).toBeNull()
  })

  it("writes to the prop the component named, not to one named here", () => {
    const shows = component({
      type: "test.banner",
      fromAsset: { kinds: ["image"], prop: "picture" },
    })

    expect(insertionForAsset(stub(shows), { id: "ast_hero", kind: "image" })).toEqual({
      type: "test.banner",
      props: { picture: { $asset: "ast_hero" } },
    })
  })

  it("takes the first registered when two claim one kind", () => {
    // A tie the application cannot break well. Registration order is the only
    // honest answer, and the catalog is expected not to create the situation.
    const first = component({ type: "test.one", fromAsset: { kinds: ["image"], prop: "src" } })
    const second = component({ type: "test.two", fromAsset: { kinds: ["image"], prop: "src" } })

    expect(insertionForAsset(stub(first, second), { id: "ast_hero", kind: "image" })?.type).toBe(
      "test.one",
    )
  })
})

describe("what the catalog promises", () => {
  it("names a prop it registers with an asset control", async () => {
    /*
     * The two halves are registered apart: a component's definition in the
     * renderer half, its properties in the editor half. Nothing in the SDK
     * can see both, so a `fromAsset` naming a prop that does not exist — or
     * one that is a text box — would write a reference somewhere no control
     * can edit and no renderer resolves. This is the only place both halves
     * are in hand.
     */
    const { propertiesFor } = await import("../properties")

    for (const type of registry.types()) {
      const from = registry.get(type)?.fromAsset

      if (from === undefined) continue

      const property = propertiesFor(type).find((one) => one.key === from.prop)

      expect(property, `${type} names ${from.prop}`).toBeDefined()
      expect(property?.control, `${type}'s ${from.prop}`).toBe("asset")
      expect(property?.target, `${type}'s ${from.prop}`).toBe("prop")
    }
  })
})
