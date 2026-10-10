import { describe, expect, it } from "vitest"
import { within } from "@testing-library/react"

import { button } from "../src/components/button/definition"
import { relFor, safeHref } from "../src/components/href"
import { link } from "../src/components/link/definition"
import { nodeOf, renderComponent } from "./support"

/**
 * Button and Link.
 *
 * Most of this is about the destination, because a destination in a document
 * is untrusted input: it arrives from the database, from an import, from a
 * template, and in a workspace from another person. On a page taking card
 * details an unchecked `href` is cross-site scripting with extra steps.
 */

describe("the destination guard", () => {
  it("allows the four schemes a checkout has a reason to use", () => {
    for (const href of [
      "https://example.test/terms",
      "http://example.test",
      "mailto:help@example.test",
      "tel:+441234567890",
    ]) {
      expect(safeHref(href)).toBe(href)
    }
  })

  it("allows a relative path, a fragment and a query", () => {
    for (const href of ["/thanks", "#details", "?step=2"]) {
      expect(safeHref(href)).toBe(href)
    }
  })

  it("refuses a javascript: URL, which runs when somebody clicks it", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull()
    // Whitespace and case are not a disguise.
    expect(safeHref("  JavaScript:alert(1)")).toBeNull()
    expect(safeHref("java\tscript:alert(1)")).toBeNull()
  })

  it("refuses a data: URL, which opens a page the author wrote in our origin", () => {
    expect(safeHref("data:text/html,<script>alert(1)</script>")).toBeNull()
  })

  it("refuses a protocol-relative URL, which is not the relative path it looks like", () => {
    // `//evil.example` is https://evil.example, not a path on this site.
    expect(safeHref("//evil.example/pay")).toBeNull()
  })

  it("refuses nothing at all", () => {
    expect(safeHref("")).toBeNull()
    expect(safeHref("   ")).toBeNull()
    expect(safeHref(undefined)).toBeNull()
    expect(safeHref(42)).toBeNull()
  })

  it("protects the page that opened a new tab", () => {
    /*
     * Without `noopener` the opened page can reach back through
     * `window.opener` and navigate the one that opened it — and the page it
     * would be replacing is a checkout.
     */
    expect(relFor("_blank")).toBe("noopener noreferrer")
    expect(relFor("_self")).toBeUndefined()
  })
})

describe("Button", () => {
  it("is a button when it does something, with a type", () => {
    /*
     * Phase 9's accessibility criteria ask for the type by name. Without it a
     * button inside a form submits that form, and the first anybody knows is a
     * half-filled checkout posting itself.
     */
    const { container } = renderComponent(button)

    expect(container.querySelector("button")).toHaveAttribute("type", "button")
  })

  it("is a link when it goes somewhere", () => {
    // An anchor styled as a button is still a link: it navigates, it opens in
    // a new tab, a browser shows where it goes. Scripting that would take all
    // of it away for nothing.
    const { container } = renderComponent(button, {
      props: { text: "Terms", href: "/terms" },
    })

    expect(container.querySelector("a")).toHaveAttribute("href", "/terms")
    expect(container.querySelector("button")).toBeNull()
  })

  it("refuses to carry a destination the browser should not follow", () => {
    const { container } = renderComponent(button, {
      props: { text: "Pay", href: "javascript:alert(1)" },
    })

    // Falls back to a button rather than rendering an anchor with no href.
    expect(container.querySelector("a")).toBeNull()
    expect(container.querySelector("button")).not.toBeNull()
  })

  it("protects the opener when it opens a new tab", () => {
    const { container } = renderComponent(button, {
      props: { text: "Terms", href: "https://example.test", target: "_blank" },
    })

    expect(container.querySelector("a")).toHaveAttribute("rel", "noopener noreferrer")
  })

  it("disables a button with the attribute, and a link by taking its href", () => {
    // An `<a>` has no `disabled`. Losing the href is what actually stops it,
    // and `aria-disabled` is what announces it.
    const asButton = renderComponent(button, { props: { text: "Pay", disabled: true } })

    expect(asButton.container.querySelector("button")).toBeDisabled()

    const asLink = renderComponent(button, {
      props: { text: "Pay", href: "/pay", disabled: true },
    })

    expect(asLink.container.querySelector("a")).not.toHaveAttribute("href")
    expect(asLink.container.querySelector("a")).toHaveAttribute("aria-disabled", "true")
  })

  it("keeps its name while loading, and says it is busy", () => {
    /*
     * A spinner that replaced the words would leave a screen reader user with
     * a button that had silently become nameless halfway through a purchase.
     */
    const { container } = renderComponent(button, { props: { text: "Pay now", loading: true } })

    expect(within(container).getByRole("button", { name: "Pay now" })).toHaveAttribute(
      "aria-busy",
      "true",
    )
    expect(container.querySelector("button")).toBeDisabled()
  })

  it("carries an analytics event as data rather than as a handler", () => {
    // One delegated listener, once analytics exists, rather than a handler per
    // button — and a data attribute costs a published page nothing until then.
    const { container } = renderComponent(button, {
      props: { text: "Pay", event: "checkout.pay_pressed" },
    })

    expect(container.querySelector("button")).toHaveAttribute(
      "data-ck-event",
      "checkout.pay_pressed",
    )
  })

  it("ships no JavaScript, which is not what I expected of it", () => {
    /*
     * Navigating is an anchor, acting is a `<button>`, disabled and busy are
     * attributes, the spinner is CSS and the event is a data attribute. The
     * first component that genuinely needs a client is the payment element.
     */
    expect(button.interactive).toBe(false)
  })

  it("refuses to have no label", () => {
    expect(button.validate?.(nodeOf("core.button", { props: { text: "" } }), {} as never)).toBe(
      "This button has no label.",
    )
  })
})

describe("Link", () => {
  it("is an anchor when it has somewhere to go", () => {
    const { container } = renderComponent(link, {
      props: { text: "Terms", href: "/terms" },
    })

    expect(within(container).getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms")
  })

  it("is a span when it does not, rather than an anchor that is not a link", () => {
    /*
     * An `<a>` with no href is not focusable, not announced as a link and not
     * clickable. Rendering one would be a thing that looks like a link and is
     * not, which is worse than text.
     */
    const { container } = renderComponent(link, { props: { text: "Terms" } })

    expect(container.querySelector("a")).toBeNull()
    expect(container.querySelector("span")?.textContent).toBe("Terms")
  })

  it("is underlined, because colour alone does not tell everybody", () => {
    // WCAG 1.4.1. Roughly one man in twelve cannot rely on the difference
    // between the two colours a brand picks.
    expect(link.defaultStyles["textDecoration"]).toBe("underline")
  })

  it("refuses to have no text and refuses to have no destination", () => {
    const rule = link.validate

    expect(rule?.(nodeOf("core.link", { props: { text: "", href: "/a" } }), {} as never)).toMatch(
      /no text/,
    )
    expect(rule?.(nodeOf("core.link", { props: { text: "Terms" } }), {} as never)).toMatch(
      /no destination/,
    )
    expect(
      rule?.(
        nodeOf("core.link", { props: { text: "Terms", href: "javascript:alert(1)" } }),
        {} as never,
      ),
    ).toMatch(/no destination/)
    expect(
      rule?.(nodeOf("core.link", { props: { text: "Terms", href: "/terms" } }), {} as never),
    ).toBeNull()
  })
})
