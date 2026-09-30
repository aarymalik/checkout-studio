import type { ReactElement } from "react"
import type { Breakpoint, CheckoutSchema, CheckoutTheme } from "@checkout-studio/schema"
import type { AssetUrls, RenderMode, RendererRegistry } from "@checkout-studio/plugin-sdk"
import type { AppError } from "@checkout-studio/utils"

import { PluginProviders } from "../providers/PluginProviders"
import { ThemeProvider } from "../providers/ThemeProvider"
import { VariableProvider } from "../providers/VariableProvider"
import { ROOT_CLASS } from "../theme/variables"
import type { ConditionSources } from "../visibility/evaluate"
import { RenderNode } from "./RenderNode"
import type { RenderWarning } from "./context"
import { createRenderContext } from "./context"
import { buildStylesheet } from "./stylesheet"

/**
 * The entry point.
 *
 * ```tsx
 * <CheckoutRenderer schema={schema} theme={theme} registry={registry} mode="published" />
 * ```
 *
 * `schema` and `theme` are serialisable data. `registry` is a populated
 * plugin-sdk registry the application built at startup — the renderer never
 * loads, imports, or registers a plugin, which is what lets the same engine
 * carry a checkout, a landing page, and a funnel without knowing about any of
 * them.
 *
 * Takes an *already-prepared* document. Validation and migration happen in
 * `prepare`, called by the application, because only the application can act on
 * a failure: the fallback chain runs through revisions in a database the
 * renderer has never heard of.
 *
 * See docs/renderer.md § Entry Point.
 */

export interface CheckoutRendererProps {
  /** A document that has been through `prepare`. */
  schema: CheckoutSchema
  /** The resolved theme: project theme plus page overrides, or a revision's snapshot. */
  theme: CheckoutTheme
  registry: RendererRegistry
  mode: RenderMode
  /** The breakpoint to resolve. Read in editor preview only. */
  breakpoint?: Breakpoint | undefined
  /** Forces a colour mode. Absent follows the visitor's preference. */
  colorMode?: "light" | "dark" | undefined
  resolveAsset?: ((assetId: string) => AssetUrls | null) | undefined
  /** Values for `$var` bindings, supplied by the plugins that own the sources. */
  variables?: Readonly<Record<string, unknown>> | undefined
  /** Values the visibility conditions are evaluated against. */
  conditions?: ConditionSources | undefined
  /** Resolves a font asset to a URL. */
  fontUrl?: ((assetId: string) => string | null) | undefined
  /**
   * Everything that went wrong, once per render.
   *
   * Called *during* render, because a published page is rendered on the server
   * where there are no effects. It is for reporting only — a callback that set
   * state here would re-render the tree that is still rendering.
   */
  onWarnings?: ((warnings: readonly RenderWarning[]) => void) | undefined
  /** A component threw. Its node renders a fallback; the rest of the page is unaffected. */
  onError?: ((error: AppError, nodeId: string) => void) | undefined
  /** A plugin's provider threw. Its context is dropped; the tree still renders. */
  onPluginError?: ((error: AppError, pluginId: string) => void) | undefined
}

export function CheckoutRenderer(props: CheckoutRendererProps): ReactElement {
  const {
    schema,
    theme,
    registry,
    mode,
    breakpoint = "desktop",
    colorMode,
    resolveAsset,
    variables,
    conditions,
    fontUrl,
    onWarnings,
    onError,
    onPluginError,
  } = props

  const context = createRenderContext({
    document: schema,
    theme,
    registry,
    mode,
    breakpoint,
    resolveAsset,
    variables,
    conditions,
  })

  // Before the tree: the stylesheet walk resolves every node's styles into the
  // context's memo, so the tree walk that follows finds them already there —
  // and every style warning is collected before any markup exists, which is
  // what lets one call report them all.
  const stylesheet = buildStylesheet(context, { fontUrl })

  const tree = <RenderNode nodeId={schema.root} context={context} onError={onError} />

  onWarnings?.(context.warnings())

  return (
    <div className={ROOT_CLASS} data-mode={colorMode}>
      {/*
        The only `dangerouslySetInnerHTML` in the package, and it carries CSS,
        never markup. Every value in it has been through the guard in the
        schema's theme validation, which refuses `<` and `>` among much else, and
        property names and class names are reduced to the characters CSS
        identifiers allow. React would otherwise HTML-escape the text and turn
        `[aria-disabled='true']` into a selector that matches nothing.
      */}
      <style
        data-ck-styles={stylesheet.themeKey}
        dangerouslySetInnerHTML={{ __html: stylesheet.css }}
      />
      <ThemeProvider theme={theme} mode={mode} breakpoint={breakpoint}>
        <VariableProvider definitions={schema.variables} values={variables ?? {}}>
          <PluginProviders providers={registry.providers()} onError={onPluginError}>
            {tree}
          </PluginProviders>
        </VariableProvider>
      </ThemeProvider>
    </div>
  )
}
