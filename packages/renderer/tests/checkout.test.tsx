import { hydrateRoot } from "react-dom/client"
import { renderToStaticMarkup, renderToString } from "react-dom/server"
import { act, render } from "@testing-library/react"
import { RegistryBuilder } from "@checkout-studio/plugin-sdk"
import type { ProviderProps, RendererRegistry } from "@checkout-studio/plugin-sdk"
import { logger } from "@checkout-studio/observability"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactElement, ReactNode } from "react"

import { CheckoutRenderer } from "../src/runtime/CheckoutRenderer"
import { buildStylesheet } from "../src/runtime/stylesheet"
import { clearThemeCache } from "../src/theme/compile"
import { useCheckoutTheme } from "../src/providers/ThemeProvider"
import { useVariable } from "../src/providers/VariableProvider"
import {
  Leaf,
  at,
  contextFor,
  deepFreeze,
  definition,
  documentOf,
  registryWith,
  sampleDocument,
  standardRegistry,
  theme,
  wideDocument,
} from "./support"

beforeEach(() => {
  clearThemeCache()
})

function checkout(overrides: Partial<Parameters<typeof CheckoutRenderer>[0]> = {}): ReactElement {
  return (
    <CheckoutRenderer
      schema={sampleDocument()}
      theme={theme}
      registry={standardRegistry()}
      mode="published"
      {...overrides}
    />
  )
}

describe("the checkout renderer", () => {
  it("renders the tree inside a scoped root", () => {
    const { container } = render(checkout())

    expect(container.querySelector(".checkout-root .ck-page .ck-section .ck-text")).not.toBeNull()
  })

  it("emits the stylesheet before the tree, so nothing paints unstyled", () => {
    const { container } = render(checkout({ schema: sampleDocument(at("desktop", { gap: 8 })) }))
    const root = container.querySelector(".checkout-root")

    // Server-rendered, ahead of the markup. This is where most of the CLS
    // budget is won or lost.
    expect(root?.firstElementChild?.tagName).toBe("STYLE")
    expect(root?.querySelector("style")?.textContent).toContain("--ck-color-primary:")
    expect(root?.querySelector("style")?.textContent).toContain(".ck-section {\n  gap: 8px;")
  })

  it("keys the stylesheet on the theme, so a debugger can see which one", () => {
    const { container } = render(checkout())

    expect(container.querySelector("style")?.getAttribute("data-ck-styles")).toBe(
      `${theme.id}:${theme.version}`,
    )
  })

  it("carries a forced colour mode on the root", () => {
    const { container } = render(checkout({ colorMode: "dark" }))

    expect(container.querySelector(".checkout-root")?.getAttribute("data-mode")).toBe("dark")
  })

  it("sets no mode when the visitor's preference should win", () => {
    const { container } = render(checkout())

    expect(container.querySelector(".checkout-root")?.hasAttribute("data-mode")).toBe(false)
  })

  it("reports everything that went wrong, once", () => {
    const onWarnings = vi.fn()

    render(
      checkout({
        schema: sampleDocument(at("desktop", { color: "{colors.nope}" })),
        registry: registryWith(definition("core.page")),
        onWarnings,
      }),
    )

    expect(onWarnings).toHaveBeenCalledTimes(1)
    const warnings = onWarnings.mock.calls[0]?.[0] as { code: string }[]
    expect(warnings.map((warning) => warning.code)).toContain("component-not-registered")
  })

  it("needs no callbacks at all", () => {
    expect(() => render(checkout())).not.toThrow()
  })
})

describe("purity", () => {
  it("never mutates the schema or the theme", () => {
    const schema = deepFreeze(sampleDocument(at("desktop", { color: "{colors.primary}" })))
    const frozen = deepFreeze(structuredClone(theme))

    // Frozen, so a write throws rather than passing quietly. The renderer is a
    // function from data to elements and nothing else.
    expect(() =>
      render(checkout({ schema, theme: frozen, registry: standardRegistry() })),
    ).not.toThrow()
  })

  it("produces identical output from identical input", () => {
    const schema = sampleDocument(at("mobile", { padding: 8 }))

    const first = renderToStaticMarkup(checkout({ schema }))
    const second = renderToStaticMarkup(checkout({ schema }))

    expect(first).toBe(second)
  })

  it("produces identical output whatever order the node keys arrive in", () => {
    // A jsonb column does not preserve key order, so the same page can come
    // back from the database with its nodes in a different order.
    const schema = wideDocument(4)
    const reordered = {
      ...schema,
      nodes: Object.fromEntries(Object.entries(schema.nodes).reverse()),
    }

    expect(renderToStaticMarkup(checkout({ schema }))).toBe(
      renderToStaticMarkup(checkout({ schema: reordered })),
    )
  })
})

describe("modes", () => {
  it("produces valid HTML on the server", () => {
    const html = renderToStaticMarkup(checkout())

    expect(html).toContain('<div class="checkout-root">')
    expect(html).toContain('class="ck-text"')
  })

  it("emits no script of its own", () => {
    // The renderer never evaluates schema content, and it never emits anything
    // that could. The only scripts on a published page are the framework's,
    // carrying the CSP nonce.
    expect(renderToStaticMarkup(checkout())).not.toContain("<script")
  })

  it("hydrates without a mismatch", async () => {
    const schema = sampleDocument(at("mobile", { padding: 8 }))
    const host = document.createElement("div")
    host.innerHTML = renderToString(checkout({ schema }))
    document.body.append(host)

    const onRecoverableError = vi.fn()

    await act(async () => {
      hydrateRoot(host, checkout({ schema }), { onRecoverableError })
    })

    // A mismatch surfaces as a recoverable error, and every one of them is a
    // subtree React threw away and rebuilt on the client.
    expect(onRecoverableError).not.toHaveBeenCalled()
    host.remove()
  })

  it("produces the same HTML at every width", () => {
    // The server cannot know the visitor's viewport, so tablet and mobile are
    // media-query CSS rather than a different tree. That is what prevents both
    // a wrong first paint and a hydration mismatch.
    const schema = sampleDocument({
      desktop: { base: { padding: 24 } },
      mobile: { base: { padding: 8 } },
    })

    const html = markupOf(renderToStaticMarkup(checkout({ schema })))

    expect(html).toContain('class="ck-section"')
    // One element, whatever the width. The breakpoints live in the stylesheet.
    expect(html.match(/ck-section/g)).toHaveLength(1)
  })

  it("emits every breakpoint as media queries on a published page", () => {
    const schema = sampleDocument({
      desktop: { base: { padding: 24 } },
      tablet: { base: { padding: 16 } },
      mobile: { base: { padding: 8 } },
    })

    const css = stylesheetOf(schema, "published")

    expect(css).toContain("@media (max-width: 1023px)")
    expect(css).toContain("@media (max-width: 767px)")
  })

  it("computes only the active breakpoint on the canvas", () => {
    const schema = sampleDocument({
      desktop: { base: { padding: 24 } },
      mobile: { base: { padding: 8 } },
    })

    const css = stylesheetOf(schema, "editor-preview", "mobile")

    expect(css).not.toContain("@media (max-width")
    expect(css).toContain("padding: 8px;")
  })

  it("resolves the canvas breakpoint's density with no query to second-guess it", () => {
    const canvas = stylesheetOf(sampleDocument(), "editor-preview", "mobile")

    expect(canvas).toContain("--ck-space-6: 28px;")
    expect(canvas).not.toContain("@media (max-width")
  })

  it("leaves a published page's density to media queries", () => {
    const live = stylesheetOf(sampleDocument(), "published")

    expect(live).toContain("--ck-space-6: 32px;")
    expect(live).toContain("@media (max-width: 767px)")
  })

  it("produces self-contained output in static mode", () => {
    const html = renderToStaticMarkup(checkout({ mode: "static" }))

    // Everything the page needs to look right is in the document: no
    // stylesheet link, no script, nothing to fetch.
    expect(html).toContain("<style")
    expect(html).not.toContain("<link")
    expect(html).not.toContain("<script")
  })

  it("scopes every rule under the checkout root in embed mode", () => {
    const schema = sampleDocument(at("desktop", { color: "red" }))
    const css = stylesheetOf(schema, "embed")

    // Isolation comes from the iframe, but the scoping still holds: nothing
    // here can style anything outside the root.
    const selectors = css
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.endsWith("{") && !line.startsWith("@"))

    expect(selectors.length).toBeGreaterThan(0)
    expect(selectors.filter((selector) => !selector.startsWith(".checkout-root"))).toEqual([])
  })
})

describe("the providers", () => {
  it("wraps the tree in the plugins' providers, outermost first", () => {
    const order: string[] = []

    function named(id: string) {
      return function Provider({ children }: ProviderProps): ReactNode {
        order.push(id)
        return <>{children}</>
      }
    }

    const registry = new RegistryBuilder()
      .component(definition("core.page"))
      .component(definition("core.section"))
      .component(definition("core.text", { container: false, renderer: Leaf }))
      .provider({ id: "checkout", component: named("checkout"), dependsOn: ["forms"] })
      .provider({ id: "forms", component: named("forms") })
      .build()

    render(checkout({ registry }))

    // The forms provider wraps the checkout provider, because checkout fields
    // are form fields.
    expect(order).toEqual(["forms", "checkout"])
  })

  it("gives an interactive component the theme", () => {
    let seen: string | null = null

    function Reader(): ReactNode {
      seen = useCheckoutTheme().theme.colors.primary
      return null
    }

    render(
      checkout({
        schema: documentOf("page", [{ id: "page", type: "core.reader" }]),
        registry: registryWith(definition("core.reader", { renderer: Reader })),
      }),
    )

    expect(seen).toBe(theme.colors.primary)
  })

  it("gives an interactive component a variable's value", () => {
    let seen: unknown = null

    function Reader(): ReactNode {
      seen = useVariable("order.total")
      return null
    }

    render(
      checkout({
        schema: documentOf("page", [{ id: "page", type: "core.reader" }]),
        registry: registryWith(definition("core.reader", { renderer: Reader })),
        variables: { "order.total": 4200 },
      }),
    )

    expect(seen).toBe(4200)
  })

  it("keeps rendering when a provider throws, without its context", () => {
    function Exploding(): ReactNode {
      throw new Error("no context for you")
    }

    const registry = new RegistryBuilder()
      .component(definition("core.page"))
      .component(definition("core.section"))
      .component(definition("core.text", { container: false, renderer: Leaf }))
      .provider({ id: "analytics", component: Exploding })
      .build()

    const reported = vi.spyOn(logger, "error").mockImplementation(() => {})
    const error = vi.spyOn(console, "error").mockImplementation(() => {})

    try {
      const { container } = render(checkout({ registry }))

      // A checkout whose analytics provider failed should still take money.
      expect(container.querySelector(".ck-text")).not.toBeNull()
      expect(reported).toHaveBeenCalledWith(
        "renderer.plugin.failed",
        { pluginId: "analytics" },
        expect.objectContaining({ message: "no context for you" }),
      )
    } finally {
      error.mockRestore()
      reported.mockRestore()
    }
  })
})

describe("memoised style resolution", () => {
  it("resolves a node's styles once, whichever walk asks", () => {
    const schema = sampleDocument(at("desktop", { color: "{colors.nope}" }))
    const onWarnings = vi.fn()

    render(checkout({ schema, onWarnings }))

    const warnings = onWarnings.mock.calls[0]?.[0] as { code: string }[]

    // The stylesheet walk and the tree walk both ask for the section's styles.
    // A second resolution would report the same unresolvable reference twice.
    expect(warnings.filter((warning) => warning.code === "style-fallback")).toHaveLength(1)
  })

  it("keys the memo on the breakpoint, so the canvas is not handed desktop's answer", () => {
    const schema = sampleDocument({
      desktop: { base: { padding: 24 } },
      mobile: { base: { padding: 8 } },
    })

    expect(stylesheetOf(schema, "editor-preview", "desktop")).toContain("padding: 24px")
    expect(stylesheetOf(schema, "editor-preview", "mobile")).toContain("padding: 8px")
  })

  it("keys the memo on the component type, so two types are resolved separately", () => {
    const schema = documentOf("page", [
      { id: "page", type: "core.page", children: ["a"] },
      { id: "a", type: "core.wide" },
    ])

    const registry = registryWith(
      definition("core.page"),
      definition("core.wide", { defaultStyles: { width: "100%" } }),
    )

    expect(stylesheetOf(schema, "published", "desktop", registry)).toContain("width: 100%")
  })
})

/** The markup, with the stylesheet stripped out. */
function markupOf(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/g, "")
}

/** The stylesheet a document produces, without going through React. */
function stylesheetOf(
  schema: Parameters<typeof contextFor>[0],
  mode: "published" | "static" | "embed" | "editor-preview",
  breakpoint: "desktop" | "tablet" | "mobile" = "desktop",
  registry: RendererRegistry = standardRegistry(),
): string {
  return buildStylesheet(contextFor(schema, { mode, breakpoint, registry })).css
}
