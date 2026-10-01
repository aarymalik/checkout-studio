import type { Breakpoint, CheckoutSchema, CheckoutTheme, Node } from "@checkout-studio/schema"
import type {
  AssetUrls,
  ComponentDefinition,
  RenderMode,
  RendererRegistry,
} from "@checkout-studio/plugin-sdk"

import { behaviourOf } from "../fallback/modes"
import type { ResolvedNodeStyles } from "../styles/resolve"
import { resolveAllStyles } from "../styles/resolve"
import type { ConditionSources } from "../visibility/evaluate"

/**
 * What the tree walker carries down.
 *
 * A plain object passed as an argument, not React context. A server component
 * cannot read a client component's context, and the walker has to run on the
 * server for static components to ship no JavaScript — so the theme, the
 * registry and the mode travel explicitly.
 *
 * That is also what makes the renderer pure. Everything a node's output depends
 * on is in here, so the same context and the same node always produce the same
 * element.
 */

export type WarningCode =
  /** No component is registered for the node's type. */
  | "component-not-registered"
  /** A style value could not be resolved and fell back. */
  | "style-fallback"
  /** A theme value failed validation and was left out of the stylesheet. */
  | "theme-value-rejected"
  /** A token reference in the theme cannot be followed. */
  | "theme-reference"
  /** An asset reference resolved to nothing. */
  | "asset-missing"
  /** A font could not be loaded as asked. */
  | "font"
  /** A component threw while rendering. */
  | "component-failed"

export interface RenderWarning {
  code: WarningCode
  message: string
  /** The node it concerns, when it concerns one. */
  nodeId?: string
}

export interface RenderContextInput {
  document: CheckoutSchema
  theme: CheckoutTheme
  registry: RendererRegistry
  mode: RenderMode
  /** The breakpoint to resolve. Only read in editor preview. */
  breakpoint?: Breakpoint | undefined
  resolveAsset?: ((assetId: string) => AssetUrls | null) | undefined
  /** Values for `$var` bindings. */
  variables?: Readonly<Record<string, unknown>> | undefined
  /** Values the visibility conditions are evaluated against. */
  conditions?: ConditionSources | undefined
}

export interface RenderContext {
  readonly document: CheckoutSchema
  readonly theme: CheckoutTheme
  readonly registry: RendererRegistry
  readonly mode: RenderMode
  readonly breakpoint: Breakpoint
  /** True when one breakpoint is resolved in JavaScript rather than as media queries. */
  readonly singleBreakpoint: boolean
  readonly resolveAsset: (assetId: string) => AssetUrls | null
  readonly variables: Readonly<Record<string, unknown>>
  readonly conditions: ConditionSources
  warn(warning: RenderWarning): void
  /** Everything reported so far, in order. */
  warnings(): readonly RenderWarning[]
  /** Resolved styles for a node, memoised. Null definition: no component is registered. */
  styles(node: Node, definition: ComponentDefinition | null): ResolvedNodeStyles
}

/**
 * The memo key for a node's resolved styles.
 *
 * `nodeId:styleHash:themeVersion:breakpoint`, as docs/theme-system.md
 * specifies. The style hash rather than the node: a node's props change far more
 * often than its styles, and re-resolving a cascade because somebody edited a
 * heading's text would be wasted work on every keystroke.
 *
 * The component type is in the key because stage 1 and stage 2 come from the
 * definition. Two nodes with identical styles and different types resolve
 * differently, and a key that ignored the type would hand one the other's
 * answer.
 *
 * The hash is a plain stringify rather than a canonical one. Key order is not
 * preserved through a jsonb column, so the same styles can hash two ways — and
 * two ways costs a recomputation, never a wrong answer, which is a much better
 * trade than normalising every node's styles on every render.
 */
export function styleKey(node: Node, theme: CheckoutTheme, breakpoint: Breakpoint): string {
  return `${node.id}:${node.type}:${JSON.stringify(node.styles)}:${theme.version}:${breakpoint}`
}

export function createRenderContext(input: RenderContextInput): RenderContext {
  const collected: RenderWarning[] = []
  const cache = new Map<string, ResolvedNodeStyles>()

  const mode = input.mode
  const breakpoint = input.breakpoint ?? "desktop"
  const theme = input.theme

  return {
    document: input.document,
    theme,
    registry: input.registry,
    mode,
    breakpoint,
    singleBreakpoint: behaviourOf(mode).singleBreakpoint,
    resolveAsset: input.resolveAsset ?? (() => null),
    variables: input.variables ?? {},
    conditions: input.conditions ?? {},
    warn: (warning: RenderWarning) => {
      collected.push(warning)
    },
    warnings: () => collected,
    styles: (node: Node, definition: ComponentDefinition | null) => {
      const key = styleKey(node, theme, breakpoint)
      const cached = cache.get(key)

      if (cached !== undefined) return cached

      const resolved = resolveAllStyles(theme, definition, node)
      cache.set(key, resolved)

      for (const fallback of resolved.fallbacks) {
        collected.push({
          code: "style-fallback",
          nodeId: node.id,
          message: `${node.id}: ${fallback.property} could not use "${fallback.value}" (${fallback.reason}).`,
        })
      }

      return resolved
    },
  }
}
