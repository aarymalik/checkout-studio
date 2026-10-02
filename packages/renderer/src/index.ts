/**
 * @checkout-studio/renderer — the rendering engine.
 *
 * Turns a schema into a page, and knows nothing about the editor. The editor
 * creates documents; this brings them to life. Every plugin, template, and
 * component in the product ultimately passes through this one pipeline, which
 * is what makes the canvas and the published page show the same thing.
 *
 * It is pure: the same schema, theme, and registry always produce the same
 * output, and neither the schema nor the theme is ever modified. It has no
 * dependency on the editor, the Studio UI, the design system, the database, or
 * the API — a published checkout ships without a byte of any of them.
 *
 * See docs/renderer.md.
 */

export { CheckoutRenderer } from "./runtime/CheckoutRenderer"
export type { CheckoutRendererProps } from "./runtime/CheckoutRenderer"

export { prepare } from "./runtime/prepare"
export type {
  PrepareFailure,
  PrepareFailureCode,
  PrepareOptions,
  PrepareResult,
  PrepareSuccess,
} from "./runtime/prepare"

export { RenderNode } from "./runtime/RenderNode"
export type { RenderNodeProps } from "./runtime/RenderNode"

export { createRenderContext, styleKey } from "./runtime/context"
export type {
  RenderContext,
  RenderContextInput,
  RenderWarning,
  WarningCode,
} from "./runtime/context"

export { planNode, planTree } from "./runtime/plan"
export type { NodePlan } from "./runtime/plan"

export { resolveProps } from "./runtime/props"
export { buildStylesheet } from "./runtime/stylesheet"
export type { Stylesheet, StylesheetOptions } from "./runtime/stylesheet"

export { MODES, behaviourOf } from "./fallback/modes"
export type { ModeBehaviour } from "./fallback/modes"
export { NodeErrorBoundary } from "./fallback/NodeErrorBoundary"
export type { NodeErrorBoundaryProps } from "./fallback/NodeErrorBoundary"
export { PluginErrorBoundary } from "./fallback/PluginErrorBoundary"
export type { PluginErrorBoundaryProps } from "./fallback/PluginErrorBoundary"
export { Unsupported } from "./fallback/Unsupported"
export type { UnsupportedProps } from "./fallback/Unsupported"

export { PluginProviders } from "./providers/PluginProviders"
export type { PluginProvidersProps } from "./providers/PluginProviders"
export { ThemeProvider, useCheckoutTheme } from "./providers/ThemeProvider"
export type { CheckoutThemeContext, ThemeProviderProps } from "./providers/ThemeProvider"
export { VariableProvider, useVariable, useVariables } from "./providers/VariableProvider"
export type { VariableContextValue, VariableProviderProps } from "./providers/VariableProvider"

export { clearThemeCache, compileTheme } from "./theme/compile"
export type { CompileOptions, CompiledTheme } from "./theme/compile"
export { ROOT_CLASS, VARIABLE_PREFIX, readToken, tokenPaths, variableFor } from "./theme/variables"

export {
  BREAKPOINT_MAX_WIDTH,
  BREAKPOINT_RANGE,
  NARROW_BREAKPOINTS,
  widerThan,
} from "./styles/breakpoints"
export type { NarrowBreakpoint } from "./styles/breakpoints"

export {
  DEFERRED_CLASS,
  HIDE_CLASS,
  HIDE_CLASS_ACTIVE,
  UNSUPPORTED_CLASS,
  classFor,
  declarationsToCss,
  emitNodeCss,
  hideClasses,
  propertyName,
  unsupportedCss,
  visibilityCss,
} from "./styles/css"
export type { EmitOptions } from "./styles/css"

export {
  baseLayer,
  declaredStates,
  inheritanceChain,
  layeredProperties,
  resolveAllStyles,
  resolveStyle,
  themeStyles,
} from "./styles/resolve"
export type { ResolveOptions, ResolvedNodeStyles } from "./styles/resolve"

export {
  MAX_REFERENCE_DEPTH,
  referenceProblems,
  resolveDeclarations,
  resolveValue,
} from "./styles/tokens"
export type {
  ReferenceProblem,
  ReferenceProblemCode,
  ResolvedDeclarations,
  StyleFallback,
  ValueResolution,
} from "./styles/tokens"

export { MAX_FAMILIES, MAX_WEIGHTS, fontFaceCss, planFonts, preloadHrefs } from "./styles/fonts"
export type { FontFace, FontPlan, FontWarning, FontWarningCode } from "./styles/fonts"

export { evaluateCondition, evaluateVisibility } from "./visibility/evaluate"
export type { ConditionSources, Decision, VisibilityResult } from "./visibility/evaluate"
