import type { ComponentValidator, Node, PropValue, StyleProperties } from "@checkout-studio/schema"
import type { ZodType } from "zod"

import type { SlotField } from "./properties"
import type { ComponentType, ReactNode } from "react"

/**
 * What a component is, from the engine's point of view.
 *
 * The engine knows a component has a type, renders to something, and may hold
 * children. It knows nothing about what any particular component *is* — there
 * is no list of components anywhere in the engine, which is what allows a
 * second product to ship a different list without the engine changing.
 *
 * See docs/plugin-api.md § Component Registration.
 */

/**
 * How the page is being rendered.
 *
 * Components need this: a payment element in `editor-preview` must show a
 * representative but inert form rather than reaching Stripe, and a fallback is
 * visible in the editor and invisible on a live checkout.
 */
export type RenderMode = "editor-preview" | "published" | "static" | "embed"

/** An asset reference, resolved. */
export interface AssetUrls {
  src: string
  /** Responsive candidates, when the pipeline produced them. */
  srcSet?: string
  width?: number
  height?: number
  /** A tiny inline placeholder, to hold the space while the image arrives. */
  placeholder?: string
}

/**
 * What the renderer hands a component.
 *
 * `props` arrives resolved: `$asset` references have become `AssetUrls` and
 * `$var` references have become values. A component never sees a reference,
 * which is what keeps reference syntax an engine concern.
 */
export interface ComponentRenderProps {
  /** The node as stored. Read-only: the renderer is pure. */
  node: Node
  props: Readonly<Record<string, unknown>>
  /** The class the renderer emitted this node's resolved styles under. */
  className: string
  /** This node's children, already rendered, in stored order. */
  children: ReactNode
  mode: RenderMode
}

/**
 * A theme slot: the values a theme may set for every instance of a component.
 *
 * The plugin owns the shape. The engine validates whatever it was handed
 * against the schema the plugin registered, and falls back to `defaults` when
 * the theme omits the slot — which is what the "component default used when no
 * theme value" rule in docs/phases.md means.
 */
export interface ComponentThemeSlotRegistration {
  /** Shown in the Theme panel. */
  label: string
  /** Validates the theme's values for this component. */
  schema: ZodType
  /** Used when the theme sets nothing. */
  defaults: Readonly<Record<string, unknown>>
  /**
   * The values the Theme panel offers, and the control each one is edited
   * with.
   *
   * Declared rather than inferred from `schema`, which says what a value is
   * and not what a person adjusting it should see. A slot that declares none
   * still renders and resolves — the panel says it has nothing to offer rather
   * than guessing — so this is additive for a plugin that had a slot before
   * the panel did.
   */
  fields?: readonly SlotField[]
  /**
   * Maps the slot's values onto CSS declarations for a node of this type.
   *
   * This is stage 1 of the six-stage cascade. The slot's vocabulary is the
   * plugin's, so only the plugin can say what `variants.primary.background`
   * means in CSS.
   */
  toStyles?: (slot: Readonly<Record<string, unknown>>, node: Node) => StyleProperties
}

/**
 * Where a component appears in the library panel.
 *
 * The canonical list, from docs/component-library.md § Component Categories.
 * A union rather than a string so that a typo is a type error instead of a
 * ninth group appearing in the panel with one component in it — the same
 * reason breakpoints and style states are unions here.
 */
export type ComponentCategory =
  "Layout" | "Typography" | "Media" | "Forms" | "Checkout" | "Marketing" | "Navigation" | "Utility"

/** Every category, in the order the library panel shows them. */
export const COMPONENT_CATEGORIES: readonly ComponentCategory[] = [
  "Layout",
  "Typography",
  "Media",
  "Forms",
  "Checkout",
  "Marketing",
  "Navigation",
  "Utility",
]

export interface ComponentDefinition {
  /** `<namespace>.<kebab-name>`. The namespace must be the registering plugin's id. */
  type: string
  /** The display name. Used by the editor's error card and the layers panel. */
  name: string
  /**
   * Which group it appears under in the library panel.
   *
   * Required, because a component nobody can find is a component nobody uses,
   * and a default would file the ones that forgot under a group where their
   * absence from the right one goes unnoticed. The catalog in
   * docs/component-library.md is the source of truth for which is which.
   */
  category: ComponentCategory
  /**
   * Whether this component ships JavaScript to a published page.
   *
   * A static component renders on the server and hydrates nothing, which is how
   * "only interactive components hydrate" is achieved — see docs/renderer.md
   * § SSR. Declaring `true` unnecessarily is the easiest way to blow the bundle
   * budget, so the default is `false`.
   */
  interactive: boolean
  /** Whether this component may hold children. A wrap or a drop into it is refused otherwise. */
  container: boolean
  /**
   * Whether a user may add one. Absent means yes.
   *
   * False for a component that exists only because a document already contains
   * it: `core.page` is every document's root, and `core.unsupported` holds a
   * node whose type is missing. Both must resolve in the registry or the
   * renderer falls back on them — and neither belongs in the library panel,
   * where the page would appear as something to drag onto itself.
   */
  insertable?: boolean
  /** Restricts what may be placed inside. Absent means any type. */
  allowedChildTypes?: readonly string[]
  defaultProps: Readonly<Record<string, PropValue>>
  /**
   * Stage 2 of the cascade, and the value an unresolvable token reference falls
   * back to. Flat rather than responsive on purpose: a default that varied by
   * breakpoint would compete with the node's own responsive overrides.
   */
  defaultStyles: StyleProperties
  /**
   * Styles for the elements a component draws inside itself.
   *
   * The cascade styles nodes. A component that renders a subtree of its own —
   * an HTML Block's markup, a rich text field's paragraphs — has elements in
   * it that are not nodes, and nothing reaches them: an `<h2>` inside a block
   * renders at body size and a list renders without bullets, which is what
   * the component gallery's first screenshot of HTML Block showed.
   *
   * A map of selector to declarations, emitted once per component type that
   * appears on the page and scoped to that type's own elements, so these rules
   * cannot reach anything else. Values are resolved exactly as a node's are, so
   * a token reference works here and a literal is as wrong here as anywhere.
   *
   * Two forms, and which one decides where the rules are scoped.
   *
   * A plain map is the same for every node of the type — HTML Block's
   * typography — so it is emitted once per type on the page and scoped to a
   * class the type's nodes share.
   *
   * A function of the node is for rules that come out of what the author put
   * in that particular node: a Code Block holds its own stylesheet. Those are
   * emitted per node and scoped to the node's own class, so one block's CSS
   * cannot reach another's.
   *
   * The selector is checked before it is emitted. What keeps a rule inside its
   * scope is the prefix rather than the grammar — a selector cannot reach up or
   * sideways once it has one — so the check is about a selector not escaping
   * the *rule*: no brace, semicolon, at-sign, backslash or quote.
   */
  descendantStyles?:
    | Readonly<Record<string, StyleProperties>>
    | ((node: Node) => Readonly<Record<string, StyleProperties>>)
  renderer: ComponentType<ComponentRenderProps>
  /** A rule about this component's own nodes. */
  validate?: ComponentValidator
  themeSlot?: ComponentThemeSlotRegistration
}

/** `<namespace>.<kebab-name>` — the same shape the schema enforces on a node's type. */
const TYPE_ID = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/

/** The namespace half of a type id, or null if the id is not one. */
export function namespaceOf(type: string): string | null {
  return TYPE_ID.test(type) ? type.slice(0, type.indexOf(".")) : null
}
