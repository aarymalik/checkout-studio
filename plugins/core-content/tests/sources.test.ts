import { describe, expect, it } from "vitest"
import { createDocument } from "@checkout-studio/schema"
import type { CheckoutSchema, Node } from "@checkout-studio/schema"

import { image } from "../src/components/image/definition"
import { video } from "../src/components/video/definition"

/**
 * Whether a media node has a source, asked of the document as stored.
 *
 * ## The bug these exist because of
 *
 * A validator reads the document as it is written down, where a source is a
 * reference — `{ "$asset": "ast_9f2a" }`. These two asked `assetOf`, which
 * answers about a *resolved* asset, the shape a renderer is handed after the
 * engine has turned the reference into URLs.
 *
 * So the answer was always no. `prepare` runs component validators and
 * refuses a document any of them rejects, which meant **a published page
 * carrying an image was served a 404** — every image, since the component
 * existed. It was found by the end-to-end test Phase 14 asks for and nobody
 * had been able to write, because writing it needed an upload without a
 * bucket.
 */

function node(type: string, props: Node["props"]): Node {
  return {
    id: "nod_one",
    type,
    parentId: "root",
    children: [],
    props,
    styles: {},
    visibility: { hidden: false },
    animations: [],
    metadata: { locked: false },
  }
}

describe.each([
  { name: "an image", definition: image, type: "core.image", missing: "This image has no source." },
  { name: "a video", definition: video, type: "core.video", missing: "This video has no source." },
])("$name", ({ definition, type, missing }) => {
  /*
   * The document is passed because the signature takes one and a rule may
   * read it. These rules read only the node, which is the point: whether a
   * source is there is a fact about one node.
   */
  const page: CheckoutSchema = createDocument({
    projectId: "prj",
    pageId: "pag",
    themeId: "theme_default",
  })

  const check = (props: Node["props"]) => definition.validate?.(node(type, props), page) ?? null

  it("has a source when the document names an asset", () => {
    // What a document actually holds. This is the case that was refused.
    expect(check({ src: { $asset: "ast_hero" }, alt: "A hero" })).toBeNull()
  })

  it("has a source when the prop has already been resolved", () => {
    // Belt and braces: the same validator run over a resolved document, which
    // is what a caller holding one would hand it.
    expect(check({ src: { src: "https://cdn.test/hero.jpg" }, alt: "A hero" })).toBeNull()
  })

  it("has none when the prop is absent", () => {
    expect(check({ alt: "A hero" })).toBe(missing)
  })

  it("has none when the reference names nothing", () => {
    expect(check({ src: { $asset: "" }, alt: "A hero" })).toBe(missing)
  })

  it("has none when the prop is a string somebody typed", () => {
    // A URL is not a source. A document stores references so that deleting an
    // asset can be refused and so one upload can be used in six places.
    expect(check({ src: "https://cdn.test/hero.jpg", alt: "A hero" })).toBe(missing)
  })
})
