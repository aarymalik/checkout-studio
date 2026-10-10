import { describe, expect, it } from "vitest"
import { within } from "@testing-library/react"

import { icon } from "../src/components/icon/definition"
import { ICONS, ICON_NAMES, iconOf } from "../src/components/icon/set"
import { image } from "../src/components/image/definition"
import { video } from "../src/components/video/definition"
import { nodeOf, renderComponent } from "./support"

/**
 * Image, Video and Icon.
 *
 * What is worth asserting about these is mostly what they refuse to do: render
 * without a source, announce themselves as nothing, autoplay in an editor, or
 * let a document with a broken value through to an element that cannot hold it.
 */

const SRC = { src: "https://cdn.example.test/hero.jpg", width: 1200, height: 800 }

describe("Image", () => {
  it("renders an img with the asset the engine resolved", () => {
    const { container } = renderComponent(image, { props: { src: SRC, alt: "A desk" } })
    const img = container.querySelector("img")

    expect(img).toHaveAttribute("src", SRC.src)
    expect(img).toHaveAttribute("alt", "A desk")
  })

  it("carries the intrinsic size, so the page does not jump as it loads", () => {
    /*
     * The pipeline knows the size and the browser can reserve the space before
     * the bytes arrive. Without it the page reflows per image — which on a
     * checkout means the button somebody is reaching for moves.
     */
    const { container } = renderComponent(image, { props: { src: SRC, alt: "A desk" } })

    expect(container.querySelector("img")).toHaveAttribute("width", "1200")
    expect(container.querySelector("img")).toHaveAttribute("height", "800")
  })

  it("is lazy unless the author says otherwise", () => {
    const lazy = renderComponent(image, { props: { src: SRC, alt: "A desk" } })

    expect(lazy.container.querySelector("img")).toHaveAttribute("loading", "lazy")

    const eager = renderComponent(image, { props: { src: SRC, alt: "A desk", eager: true } })

    expect(eager.container.querySelector("img")).toHaveAttribute("loading", "eager")
  })

  it("always emits alt, so nothing is announced by its filename", () => {
    /*
     * An `<img>` with no `alt` attribute is read out as its source. That is how
     * somebody ends up hearing "hero-final-v3-compressed dot jpg".
     */
    const { container } = renderComponent(image, { props: { src: SRC } })

    expect(container.querySelector("img")).toHaveAttribute("alt", "")
  })

  it("empties alt for a decorative image, which is a different claim", () => {
    // `alt=""` tells assistive technology to skip it. That is right for an
    // image the text beside it already describes, and wrong for a product
    // photo — only the author knows which.
    const { container } = renderComponent(image, {
      props: { src: SRC, alt: "ignored", decorative: true },
    })

    expect(container.querySelector("img")).toHaveAttribute("alt", "")
  })

  it("renders nothing on a published page without a source", () => {
    // A broken image icon on a page somebody is paying on.
    const { container } = renderComponent(image, { props: {}, mode: "published" })

    expect(container.querySelector("img")).toBeNull()
    expect(container.firstElementChild).toBeNull()
  })

  it("keeps a box in the editor without one, so it can be fixed", () => {
    // A component that renders nothing cannot be selected, and the user has no
    // way to give it the source it is missing.
    const { container } = renderComponent(image, { props: {}, mode: "editor-preview" })

    expect(container.querySelector("[data-ck-empty-image]")).not.toBeNull()
  })

  it("refuses a missing source, and a missing description", () => {
    const rule = image.validate

    expect(rule?.(nodeOf("core.image", { props: {} }), {} as never)).toBe(
      "This image has no source.",
    )
    expect(rule?.(nodeOf("core.image", { props: { src: SRC } }), {} as never)).toMatch(
      /no description/,
    )
    expect(
      rule?.(nodeOf("core.image", { props: { src: SRC, decorative: true } }), {} as never),
    ).toBeNull()
    expect(
      rule?.(nodeOf("core.image", { props: { src: SRC, alt: "A desk" } }), {} as never),
    ).toBeNull()
  })
})

describe("Video", () => {
  it("renders a video element with controls by default", () => {
    const { container } = renderComponent(video, { props: { src: SRC } })

    // A video somebody cannot pause is a video somebody closes the tab on.
    expect(container.querySelector("video")).toHaveAttribute("controls")
  })

  it("mutes itself when it autoplays, because browsers refuse otherwise", () => {
    /*
     * A page asking for both would simply not play, with nothing on screen to
     * explain it. Implied rather than left to two switches to agree.
     */
    const { container } = renderComponent(video, {
      props: { src: SRC, autoplay: true },
      mode: "published",
    })

    expect(container.querySelector("video")).toHaveProperty("muted", true)
  })

  it("never autoplays in the editor, whatever the node says", () => {
    // A canvas where four videos start the moment a page opens is a canvas
    // nobody can work on.
    const { container } = renderComponent(video, {
      props: { src: SRC, autoplay: true },
      mode: "editor-preview",
    })

    expect(container.querySelector("video")).not.toHaveAttribute("autoplay")
  })

  it("still reports itself muted in the editor, so the setting is not a surprise", () => {
    const { container } = renderComponent(video, {
      props: { src: SRC, autoplay: true },
      mode: "editor-preview",
    })

    expect(container.querySelector("video")).toHaveProperty("muted", true)
  })

  it("ships no JavaScript, because the browser plays it", () => {
    /*
     * `interactive` means "this puts JavaScript on a published page". A
     * `<video>` is played, paused and scrubbed by the browser and none of it
     * is ours — declaring otherwise would put React on a checkout to do what
     * an element already does.
     */
    expect(video.interactive).toBe(false)
  })

  it("refuses a missing source", () => {
    expect(video.validate?.(nodeOf("core.video", { props: {} }), {} as never)).toBe(
      "This video has no source.",
    )
  })
})

describe("Icon", () => {
  it("draws the icon it was asked for", () => {
    const { container } = renderComponent(icon, { props: { name: "lock" } })

    expect(container.querySelectorAll("path")).toHaveLength(ICONS.lock.paths.length)
  })

  it("falls back to a real icon when the document holds something that is not one", () => {
    // A document can hold anything a previous version wrote or an import
    // produced. An unknown name must not render an empty `<svg>`.
    expect(iconOf("not-an-icon")).toBe(ICONS.check)
    expect(iconOf(undefined)).toBe(ICONS.check)
  })

  it("inherits the text colour rather than carrying its own", () => {
    // An icon inside a muted paragraph should be muted without anybody setting
    // it twice.
    const { container } = renderComponent(icon)

    expect(container.querySelector("svg")).toHaveAttribute("stroke", "currentColor")
  })

  it("is hidden when it has no label, because an unlabelled icon says nothing", () => {
    const { container } = renderComponent(icon, { props: { name: "check", label: "" } })

    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true")
    expect(container.querySelector("svg")).not.toHaveAttribute("role")
  })

  it("is an image with a name when it has one", () => {
    const { container } = renderComponent(icon, { props: { name: "lock", label: "Secure" } })

    expect(within(container).getByRole("img", { name: "Secure" })).toBeInTheDocument()
  })

  it("sizes itself in em, so it follows the text beside it", () => {
    // A 24px icon next to a 14px caption is a decision nobody made twice.
    expect(String(icon.defaultStyles["width"]).endsWith("em")).toBe(true)
  })

  it("offers every icon in the set, and no more", () => {
    /*
     * The set is short on purpose: an icon component whose name is a prop
     * cannot be tree-shaken, so a library would ship a thousand icons to a
     * page whose whole first-party budget is 60 KB.
     */
    expect(ICON_NAMES.length).toBeLessThanOrEqual(12)
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length)
  })
})
