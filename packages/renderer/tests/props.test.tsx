import { renderToStaticMarkup } from "react-dom/server"
import { render, screen } from "@testing-library/react"
import type { AssetUrls } from "@checkout-studio/plugin-sdk"
import { logger } from "@checkout-studio/observability"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"

import { PluginErrorBoundary } from "../src/fallback/PluginErrorBoundary"
import { ThemeProvider, useCheckoutTheme } from "../src/providers/ThemeProvider"
import { VariableProvider, useVariable, useVariables } from "../src/providers/VariableProvider"
import { buildStylesheet } from "../src/runtime/stylesheet"
import { resolveProps } from "../src/runtime/props"
import { clearThemeCache } from "../src/theme/compile"
import { contextFor, definition, documentOf, theme } from "./support"

beforeEach(() => {
  clearThemeCache()
})

const urls: AssetUrls = { src: "/assets/hero.webp", width: 1200, height: 600 }

function nodeAndContext(props: Record<string, unknown>, overrides = {}) {
  const document = documentOf("n", [{ id: "n", type: "core.section", props: props as never }])
  const context = contextFor(document, overrides)

  return { node: document.nodes["n"]!, context }
}

describe("resolving a node's props", () => {
  it("passes a scalar straight through", () => {
    const { node, context } = nodeAndContext({ label: "Pay", count: 2, on: true, none: null })

    expect(resolveProps(node, context, {})).toEqual({
      label: "Pay",
      count: 2,
      on: true,
      none: null,
    })
  })

  it("puts the component's defaults underneath", () => {
    const { node, context } = nodeAndContext({ size: "lg" })

    expect(resolveProps(node, context, { size: "md", variant: "primary" })).toEqual({
      size: "lg",
      variant: "primary",
    })
  })

  it("resolves an asset reference to its urls", () => {
    const { node, context } = nodeAndContext(
      { image: { $asset: "ast_hero" } },
      { resolveAsset: () => urls },
    )

    // A component never sees a reference, which is what keeps reference syntax
    // an engine concern.
    expect(resolveProps(node, context, {})).toEqual({ image: urls })
  })

  it("reports an asset that resolves to nothing", () => {
    const { node, context } = nodeAndContext({ image: { $asset: "ast_gone" } })

    expect(resolveProps(node, context, {})).toEqual({ image: null })
    expect(context.warnings()).toEqual([
      {
        code: "asset-missing",
        nodeId: "n",
        message: "n references asset ast_gone, which resolved to nothing.",
      },
    ])
  })

  it("resolves a variable reference to its value", () => {
    const { node, context } = nodeAndContext(
      { total: { $var: "order.total" } },
      { variables: { "order.total": 4200 } },
    )

    expect(resolveProps(node, context, {})).toEqual({ total: 4200 })
  })

  it("uses a variable's declared fallback until its source answers", () => {
    const document = documentOf("n", [
      { id: "n", type: "core.section", props: { total: { $var: "order.total" } as never } },
    ])
    const withDefinition = {
      ...document,
      variables: {
        "order.total": { source: "order.total", type: "currency" as const, fallback: 0 },
      },
    }

    const context = contextFor(withDefinition)

    // Not an error. An order total arrives after the cart does.
    expect(resolveProps(withDefinition.nodes["n"]!, context, {})).toEqual({ total: 0 })
    expect(context.warnings()).toEqual([])
  })

  it("resolves a variable with no definition and no value to null", () => {
    const { node, context } = nodeAndContext({ total: { $var: "order.total" } })

    expect(resolveProps(node, context, {})).toEqual({ total: null })
  })

  it("prefers a supplied value of null over the fallback", () => {
    const { node, context } = nodeAndContext(
      { coupon: { $var: "coupon" } },
      { variables: { coupon: null } },
    )

    // The source answered, and its answer is "nothing applied".
    expect(resolveProps(node, context, {})).toEqual({ coupon: null })
  })

  it("recurses into arrays and objects", () => {
    const { node, context } = nodeAndContext(
      {
        features: [
          { icon: { $asset: "ast_hero" }, label: "Fast" },
          { icon: { $asset: "ast_hero" }, label: "Safe" },
        ],
        nested: { deep: { deeper: [{ $var: "order.total" }] } },
      },
      { resolveAsset: () => urls, variables: { "order.total": 99 } },
    )

    // A list of features is an array of objects, and each of those may carry an
    // icon asset. Flattening them would push structure into property names.
    expect(resolveProps(node, context, {})).toEqual({
      features: [
        { icon: urls, label: "Fast" },
        { icon: urls, label: "Safe" },
      ],
      nested: { deep: { deeper: [99] } },
    })
  })

  it("resolves nothing for a node with no props", () => {
    const { node, context } = nodeAndContext({})

    expect(resolveProps(node, context, {})).toEqual({})
  })
})

describe("the theme provider", () => {
  function Reader(): ReactNode {
    const { theme: read, mode, breakpoint } = useCheckoutTheme()

    return <span>{`${read.id} ${mode} ${breakpoint}`}</span>
  }

  it("hands an interactive component the theme, the mode, and the breakpoint", () => {
    render(
      <ThemeProvider theme={theme} mode="editor-preview" breakpoint="mobile">
        <Reader />
      </ThemeProvider>,
    )

    expect(screen.getByText(`${theme.id} editor-preview mobile`)).toBeInTheDocument()
  })

  it("says so when a component is mounted outside a rendered checkout", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})

    try {
      // A component mounted somewhere the renderer did not put it. Naming the
      // cause beats handing back a default theme nobody chose.
      expect(() => renderToStaticMarkup(<Reader />)).toThrow(/inside a rendered checkout/)
    } finally {
      error.mockRestore()
    }
  })
})

describe("the variable provider", () => {
  function Reader({ name }: { name: string }): ReactNode {
    return <span>{String(useVariable(name))}</span>
  }

  function Counter(): ReactNode {
    return <span>{Object.keys(useVariables().definitions).length}</span>
  }

  const definitions = {
    "order.total": { source: "order.total", type: "currency" as const, fallback: 0 },
  }

  it("gives a value when the source has answered", () => {
    render(
      <VariableProvider definitions={definitions} values={{ "order.total": 4200 }}>
        <Reader name="order.total" />
      </VariableProvider>,
    )

    expect(screen.getByText("4200")).toBeInTheDocument()
  })

  it("gives the declared fallback until it has", () => {
    render(
      <VariableProvider definitions={definitions} values={{}}>
        <Reader name="order.total" />
      </VariableProvider>,
    )

    expect(screen.getByText("0")).toBeInTheDocument()
  })

  it("gives nothing for a variable the document never declared", () => {
    render(
      <VariableProvider definitions={definitions} values={{}}>
        <Reader name="order.tax" />
      </VariableProvider>,
    )

    expect(screen.getByText("undefined")).toBeInTheDocument()
  })

  it("exposes the definitions, for a component that needs the type", () => {
    render(
      <VariableProvider definitions={definitions} values={{}}>
        <Counter />
      </VariableProvider>,
    )

    expect(screen.getByText("1")).toBeInTheDocument()
  })

  it("says so when a component is mounted outside a rendered checkout", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})

    try {
      expect(() => renderToStaticMarkup(<Counter />)).toThrow(/inside a rendered checkout/)
    } finally {
      error.mockRestore()
    }
  })
})

describe("the plugin boundary", () => {
  function Exploding(): ReactNode {
    throw new Error("no context for you")
  }

  it("renders its children while nothing is wrong", () => {
    render(
      <PluginErrorBoundary pluginId="forms" fallback={<span>without</span>}>
        <span>with</span>
      </PluginErrorBoundary>,
    )

    expect(screen.getByText("with")).toBeInTheDocument()
  })

  it("renders them without the provider once it has failed", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})

    try {
      render(
        <PluginErrorBoundary pluginId="forms" fallback={<span>without</span>}>
          <Exploding />
        </PluginErrorBoundary>,
      )

      // The components that needed the context will fail individually at their
      // own boundaries, which is a far smaller loss than a blank page.
      expect(screen.getByText("without")).toBeInTheDocument()
    } finally {
      error.mockRestore()
    }
  })

  it("reports the plugin it was guarding", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const reported = vi.spyOn(logger, "error").mockImplementation(() => {})

    try {
      render(
        <PluginErrorBoundary pluginId="forms" fallback={null}>
          <Exploding />
        </PluginErrorBoundary>,
      )

      expect(reported.mock.calls[0]?.[1]).toEqual({ pluginId: "forms" })
    } finally {
      error.mockRestore()
      reported.mockRestore()
    }
  })
})

describe("reporting through the stylesheet", () => {
  it("reports a theme value it could not emit", () => {
    const context = contextFor(documentOf("n", [{ id: "n", type: "core.section" }]), {
      // Unsafe, not merely wrong. Emission asks whether a value can escape
      // its declaration; whether it is actually a colour is asked by the
      // theme's own validation, which prepare() runs.
      theme: {
        ...theme,
        version: "9.9.9",
        colors: { ...theme.colors, primary: "red; position: fixed" },
      },
    })

    buildStylesheet(context)

    expect(context.warnings().map((warning) => warning.code)).toContain("theme-value-rejected")
  })

  it("reports a font it could not load as asked", () => {
    const context = contextFor(documentOf("n", [{ id: "n", type: "core.section" }]), {
      theme: {
        ...theme,
        version: "9.9.8",
        typography: {
          ...theme.typography,
          fontFamily: {
            ...theme.typography.fontFamily,
            heading: {
              family: "Playfair",
              source: "google",
              weights: [400],
              fallback: ["serif"],
            },
            body: { family: "Inter", source: "google", weights: [400], fallback: ["sans-serif"] },
          },
        },
      },
    })

    buildStylesheet(context)

    expect(context.warnings().map((warning) => warning.code)).toContain("font")
  })

  it("resolves a font url when the application supplies one", () => {
    const context = contextFor(documentOf("n", [{ id: "n", type: "core.section" }]), {
      theme: hostedFontTheme("9.9.7"),
    })

    const { css } = buildStylesheet(context, { fontUrl: () => "/fonts/inter.woff2" })

    expect(css).toContain('src: url("/fonts/inter.woff2") format("woff2");')
  })

  it("serves no font file when the application supplies no resolver", () => {
    const context = contextFor(documentOf("n", [{ id: "n", type: "core.section" }]), {
      theme: hostedFontTheme("9.9.6"),
    })

    // A font with no URL renders in its fallback stack rather than in nothing.
    expect(buildStylesheet(context).css).not.toContain("@font-face")
  })

  it("emits the hide rules a breakpoint-only node needs, and no others", () => {
    const document = documentOf("page", [
      { id: "page", type: "core.page", children: ["wide"] },
      { id: "wide", type: "core.section", visibility: { breakpoints: ["desktop"] } },
    ])

    const { css } = buildStylesheet(contextFor(document))

    expect(css).toContain(".ck-hide-tablet")
    expect(css).toContain(".ck-hide-mobile")
    // Four rules nobody references is four rules every visitor downloads.
    expect(css).not.toContain(".ck-hide-desktop")
  })

  it("names the component in the unsupported placeholder's data attribute", () => {
    const context = contextFor(documentOf("n", [{ id: "n", type: "checkout.coupon" }]))

    // A node with no component contributes no rules, since there is nothing to
    // style — but it is still walked, because its type may come back.
    expect(buildStylesheet(context).css).not.toContain(".ck-n")
  })
})

describe("the style memo", () => {
  it("answers the second ask from the cache", () => {
    const document = documentOf("n", [
      { id: "n", type: "core.section", styles: { desktop: { base: { padding: 8 } } } },
    ])
    const context = contextFor(document)
    const node = document.nodes["n"]!
    const which = definition("core.section")

    const first = context.styles(node, which)

    expect(context.styles(node, which)).toBe(first)
  })
})

/** A theme whose heading and body fonts are self-hosted assets. */
function hostedFontTheme(version: string) {
  const inter = {
    family: "Inter",
    source: "custom" as const,
    assetId: "ast_inter",
    weights: [400],
    fallback: ["sans-serif"],
  }

  return {
    ...theme,
    version,
    typography: {
      ...theme.typography,
      fontFamily: { heading: inter, body: inter, mono: theme.typography.fontFamily.mono },
    },
  }
}
