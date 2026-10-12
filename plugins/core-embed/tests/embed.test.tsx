import { createDocument } from "@checkout-studio/schema"
import type { CheckoutSchema, Node } from "@checkout-studio/schema"
import { describe, expect, it } from "vitest"

import { embed } from "../src/components/embed/definition"
import { PROVIDERS, srcFor } from "../src/components/embed/providers"
import { embedBesidePayment } from "../src/validators"
import { violationsIn } from "./axe"
import { nodeOf, renderComponent } from "./support"

function frame(props: Record<string, unknown>): HTMLIFrameElement | null {
  const { container } = renderComponent(embed, { props })

  return container.querySelector("iframe")
}

describe("the address an embed frames", () => {
  it("is built from a provider and an id, never taken from the document", () => {
    expect(frame({ provider: "youtube", id: "dQw4w9WgXcQ" })?.getAttribute("src")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    )
    expect(frame({ provider: "vimeo", id: "76979871" })?.getAttribute("src")).toBe(
      "https://player.vimeo.com/video/76979871",
    )
    expect(frame({ provider: "calendly", id: "acme/intro-call" })?.getAttribute("src")).toBe(
      "https://calendly.com/acme/intro-call",
    )
    expect(frame({ provider: "typeform", id: "u6nXL7" })?.getAttribute("src")).toBe(
      "https://form.typeform.com/to/u6nXL7",
    )
  })

  it("uses YouTube's address that sets nothing until play", () => {
    // A checkout is not a place to drop a third party's cookies on somebody
    // who has not asked for a video.
    expect(PROVIDERS["youtube"]?.origin).toBe("https://www.youtube-nocookie.com")
  })

  it("refuses a provider it does not frame", () => {
    expect(frame({ provider: "evil.example", id: "x" })).toBeNull()
    expect(frame({ provider: 7, id: "x" })).toBeNull()
  })

  it.each([
    ["a path traversal, which is a different address", "../../evil"],
    ["an absolute URL, which would leave the origin", "https://evil.example/x"],
    ["a protocol-relative URL", "//evil.example"],
    ["a query appended to the id", "dQw4w9WgXcQ?x=1"],
    ["a fragment", "dQw4w9WgXcQ#x"],
    ["an empty id", ""],
    ["whitespace", "   "],
  ])("refuses %s", (_name, id) => {
    expect(frame({ provider: "youtube", id })).toBeNull()
  })

  it("will not take an id of the wrong shape for the provider", () => {
    // Vimeo ids are numbers. A word there is somebody pasting a YouTube id
    // into a Vimeo embed, and a frame that loads nothing is worse than one
    // that is not drawn.
    expect(frame({ provider: "vimeo", id: "dQw4w9WgXcQ" })).toBeNull()
  })

  it("trims what was pasted", () => {
    expect(frame({ provider: "youtube", id: "  dQw4w9WgXcQ " })?.getAttribute("src")).toContain(
      "dQw4w9WgXcQ",
    )
  })
})

describe("the frame itself", () => {
  const sandboxed = frame({ provider: "typeform", id: "u6nXL7" })

  it("is sandboxed", () => {
    expect(sandboxed?.getAttribute("sandbox")).toBeTruthy()
  })

  it("does not grant the frame its own origin", () => {
    // With `allow-same-origin` a frame reaches its own storage and cookies.
    // These four work without it, and a payment page is where the quieter
    // frame is the right default.
    expect(sandboxed?.getAttribute("sandbox")).not.toContain("allow-same-origin")
  })

  it("does not let the frame navigate the page around it", () => {
    // The one that matters most: a checkout a customer can be taken off
    // mid-payment, by something inside a video player.
    expect(sandboxed?.getAttribute("sandbox")).not.toContain("allow-top-navigation")
  })

  it("tells the provider which site framed them, not which page", () => {
    expect(sandboxed?.getAttribute("referrerpolicy")).toBe("strict-origin-when-cross-origin")
  })

  it("is still checked by axe, which is the claim the frame skip rests on", async () => {
    /*
     * The axe helper does not walk into frames, because jsdom has no window
     * inside one to ask. The comment there says the frame element itself is
     * still checked from the host document — this is that claim, tested: an
     * embed with no accessible name fails.
     */
    const { container } = renderComponent(embed, {
      props: { provider: "typeform", id: "u6nXL7", title: "" },
    })

    expect(await violationsIn(container)).toContain("frame-title")
  })

  it("is named, because a frame with no title is unlabelled to a screen reader", () => {
    expect(sandboxed?.getAttribute("title")).toBe("Typeform")
    expect(frame({ provider: "typeform", id: "u6nXL7", title: "Book a call" })?.title).toBe(
      "Book a call",
    )
  })

  it("loads lazily, so a frame below the fold is not fetched to draw the page", () => {
    expect(sandboxed?.getAttribute("loading")).toBe("lazy")
  })
})

describe("in the editor", () => {
  it("draws the box and does not reach the provider", () => {
    /*
     * A canvas where four embeds call four third parties on open is slow and
     * watched — and an editor that fetches a booking page is a service telling
     * that provider about a page nobody has published.
     */
    const { container } = renderComponent(embed, {
      props: { provider: "youtube", id: "dQw4w9WgXcQ" },
      mode: "editor-preview",
    })

    expect(container.querySelector("iframe")).toBeNull()
    expect(
      container.querySelector("[data-ck-embed-provider]")?.getAttribute("data-ck-embed-provider"),
    ).toBe("YouTube")
  })

  it("keeps a box for an embed with nothing in it yet, so it can be selected", () => {
    const { container } = renderComponent(embed, {
      props: { provider: "youtube", id: "" },
      mode: "editor-preview",
    })

    expect(container.querySelector("[data-ck-empty-embed]")).not.toBeNull()
  })

  it("draws nothing on a published page when it has no address", () => {
    const { container } = renderComponent(embed, { props: { provider: "youtube", id: "" } })

    expect(container).toBeEmptyDOMElement()
  })
})

describe("validation", () => {
  it("accepts an embed with a provider and an id", () => {
    expect(
      embed.validate?.(
        nodeOf("core.embed", { props: { provider: "youtube", id: "dQw4w9WgXcQ" } }),
        {} as never,
      ),
    ).toBeNull()
  })

  it("says which identifier is missing, in the provider's own words", () => {
    expect(
      embed.validate?.(
        nodeOf("core.embed", { props: { provider: "calendly", id: "" } }),
        {} as never,
      ),
    ).toBe("This Calendly embed has no booking link.")
  })

  it("refuses an embed with no provider", () => {
    expect(embed.validate?.(nodeOf("core.embed", { props: {} }), {} as never)).toMatch(
      /no provider/,
    )
  })
})

describe("an embed beside the payment form", () => {
  /** A document whose nodes are laid out as given. */
  function documentOf(
    specs: readonly { id: string; type: string; children?: string[] }[],
  ): CheckoutSchema {
    const base = createDocument({
      projectId: "prj_t",
      pageId: "pag_t",
      themeId: "theme_default",
      random: () => 0.5,
    })
    const root = base.nodes[base.root] as Node
    const nodes: Record<string, Node> = { ...base.nodes }

    for (const spec of specs) {
      nodes[spec.id] = {
        ...nodeOf(spec.type, { id: spec.id, children: spec.children ?? [] }),
        parentId: base.root,
      }
    }

    for (const spec of specs) {
      for (const child of spec.children ?? []) {
        const node = nodes[child]

        if (node !== undefined) nodes[child] = { ...node, parentId: spec.id }
      }
    }

    const top = specs.filter((spec) => !specs.some((other) => other.children?.includes(spec.id)))

    return {
      ...base,
      nodes: { ...nodes, [base.root]: { ...root, children: top.map((spec) => spec.id) } },
    }
  }

  it("finds nothing on a page with no payment element", () => {
    // Which is every page until Phase 13, and is the correct answer for one.
    const document = documentOf([
      { id: "section", type: "core.section", children: ["embed"] },
      { id: "embed", type: "core.embed" },
    ])

    expect(embedBesidePayment.validate(document)).toEqual([])
  })

  it("reports an embed in the same section as the payment element", () => {
    const document = documentOf([
      { id: "section", type: "core.section", children: ["embed", "pay"] },
      { id: "embed", type: "core.embed" },
      { id: "pay", type: "checkout.payment-element" },
    ])
    const [issue] = embedBesidePayment.validate(document)

    expect(issue?.nodeIds).toEqual(["embed"])
    expect(issue?.severity).toBe("error")
  })

  it("finds it however deeply the embed is nested in that section", () => {
    const document = documentOf([
      { id: "section", type: "core.section", children: ["stack", "pay"] },
      { id: "stack", type: "core.stack", children: ["inner"] },
      { id: "inner", type: "core.container", children: ["embed"] },
      { id: "embed", type: "core.embed" },
      { id: "pay", type: "checkout.payment-element" },
    ])

    expect(embedBesidePayment.validate(document)).toHaveLength(1)
  })

  it("allows an embed in a different section", () => {
    const document = documentOf([
      { id: "one", type: "core.section", children: ["embed"] },
      { id: "embed", type: "core.embed" },
      { id: "two", type: "core.section", children: ["pay"] },
      { id: "pay", type: "checkout.payment-element" },
    ])

    expect(embedBesidePayment.validate(document)).toEqual([])
  })
})

describe("the origins a published page would have to name", () => {
  it("is every provider, and each is a bare origin", () => {
    /*
     * Phase 16 builds `frame-src` from these. An entry with a path or a
     * wildcard would be a policy that says more than it means, so the shape
     * is checked here rather than discovered there.
     */
    for (const provider of Object.values(PROVIDERS)) {
      expect(provider.origin).toMatch(/^https:\/\/[a-z0-9.-]+$/)
      expect(provider.src("x").startsWith(`${provider.origin}/`)).toBe(true)
    }
  })

  it("has no provider that accepts an id it would not put in its own origin", () => {
    for (const provider of Object.values(PROVIDERS)) {
      expect(srcFor(provider, "https://evil.example")).toBeNull()
      expect(srcFor(provider, "../evil")).toBeNull()
    }
  })
})
