import { compileTheme } from "../theme/compile"
import { emitNodeCss, visibilityCss } from "../styles/css"
import { fontFaceCss, planFonts } from "../styles/fonts"
import type { FontPlan } from "../styles/fonts"
import type { RenderContext } from "./context"
import { planTree } from "./plan"

/**
 * The page's stylesheet, built in one pass.
 *
 * Emitted server-side during SSR so there is no unstyled flash and no layout
 * shift, which is where most of the CLS budget in docs/performance.md is won or
 * lost.
 *
 * Built from the same plan the markup is built from, so the stylesheet and the
 * tree cannot disagree about which nodes exist. A hidden subtree contributes
 * nothing: no markup, and no bytes of CSS either.
 */

export interface Stylesheet {
  css: string
  fonts: FontPlan
  /** `themeId:version` — what the theme compilation was memoised on. */
  themeKey: string
}

export interface StylesheetOptions {
  /** Resolves a font asset to a URL. A font with no URL renders in its fallback stack. */
  fontUrl?: ((assetId: string) => string | null) | undefined
}

export function buildStylesheet(
  context: RenderContext,
  options: StylesheetOptions = {},
): Stylesheet {
  // Editor preview resolves one breakpoint, so the theme's density and
  // fluid-type variables are resolved with it rather than left to a media query
  // that would fire on the browser window instead of the device frame.
  const theme = compileTheme(
    context.theme,
    context.singleBreakpoint ? { breakpoint: context.breakpoint } : {},
  )

  for (const rejected of theme.rejected) {
    context.warn({
      code: "theme-value-rejected",
      message: `The theme's ${rejected.path} ("${rejected.value}") is not a value we can emit, so it was left out.`,
    })
  }

  const fonts = planFonts(context.document, context.theme)

  for (const warning of fonts.warnings) {
    context.warn({ code: "font", message: warning.message })
  }

  let css = theme.css
  css += fontFaceCss(fonts, options.fontUrl ?? (() => null))

  const emitOptions = context.singleBreakpoint ? { activeBreakpoint: context.breakpoint } : {}
  const used = new Set<string>()

  for (const plan of planTree(context)) {
    for (const className of plan.hiding) used.add(className)

    if (plan.definition === null) continue

    css += emitNodeCss(plan.node.id, context.styles(plan.node, plan.definition), emitOptions)
  }

  css += visibilityCss(used)

  return { css, fonts, themeKey: theme.key }
}
