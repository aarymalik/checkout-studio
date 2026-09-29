import { z } from "zod"

/**
 * The checkout document.
 *
 * Declared once as Zod and inferred into TypeScript, so the shape that is
 * validated at runtime and the shape the editor is typed against cannot drift.
 * Writing the interfaces by hand and the validators separately is how a field
 * ends up optional in one and required in the other.
 *
 * Nothing here knows what a component is. Types are opaque strings and props
 * are opaque records: the engine validates structure and references, and every
 * component-specific rule arrives through a registry. That is what keeps
 * checkout logic out of the thing that would otherwise have to know about it.
 *
 * See docs/schema.md.
 */

/** `<namespace>.<kebab-name>`, per docs/component-library.md. */
export const typeId = z
  .string()
  .regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/, "Expected <namespace>.<kebab-name>")

export const nodeId = z.string().min(1).max(64)

/**
 * A page that used a since-removed plugin still opens.
 *
 * Its nodes load as this type carrying their original data, so nothing is lost
 * and the page fully recovers when the plugin returns. See
 * docs/state-management.md § Validation.
 */
export const UNSUPPORTED_TYPE = "core.unsupported"

/** The three breakpoints, widest first. They cascade in this order. */
export const BREAKPOINTS = ["desktop", "tablet", "mobile"] as const
export const breakpoint = z.enum(BREAKPOINTS)
export type Breakpoint = (typeof BREAKPOINTS)[number]

/** Within a breakpoint, every state inherits from `base`. */
export const STATES = ["base", "hover", "focus", "active", "disabled"] as const
export const styleState = z.enum(STATES)
export type StyleState = (typeof STATES)[number]

/**
 * A style declaration.
 *
 * Deliberately unvalidated beyond being JSON: the set of properties is the
 * design system's business and grows with it, and a schema that enumerated them
 * would reject a document produced by a newer version of the product.
 */
export const styleValue = z.union([z.string(), z.number(), z.boolean(), z.null()])
export const styleProperties = z.record(z.string(), styleValue)

export const stateStyles = z.partialRecord(styleState, styleProperties)
export const responsiveStyles = z.partialRecord(breakpoint, stateStyles)

/**
 * An asset is referenced, never embedded.
 *
 * The renderer resolves the reference to an optimised URL at render time, so
 * assets can be moved, re-optimised or re-hosted without touching a page.
 */
export const assetReference = z.object({ $asset: z.string().min(1) }).strict()

/** A prop bound to a value supplied at render time. */
export const variableReference = z.object({ $var: z.string().min(1) }).strict()

/**
 * A property value.
 *
 * Recursive, because props hold nested structures — a list of features, a set
 * of columns — and flattening them would push structure into the property name.
 */
/**
 * `$` starts a reference, and nothing else.
 *
 * Without this, `{ "$asset": "ast_9f2a", "src": "..." }` — a reference somebody
 * typed a second key into — matches the plain-object branch and is accepted as
 * data. It would then render as nothing at all, with no error anywhere, because
 * the renderer looks for a reference and finds an object that is not quite one.
 */
const plainObject = z.record(
  z.string().refine((key) => !key.startsWith("$"), {
    message: "Keys beginning with $ are reserved for references.",
  }),
  propValueLazy(),
)

function propValueLazy(): z.ZodType<PropValue> {
  return z.lazy(() => propValue)
}

export const propValue: z.ZodType<PropValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    assetReference,
    variableReference,
    z.array(propValueLazy()),
    plainObject,
  ]),
)

export type PropValue =
  | string
  | number
  | boolean
  | null
  | { $asset: string }
  | { $var: string }
  | PropValue[]
  | { [key: string]: PropValue }

export const props = z.record(z.string(), propValue)

/**
 * When a node renders.
 *
 * `hidden` is the editor's own switch and is absolute — a hidden node renders
 * nowhere. Conditions are evaluated at render time against data the plugins
 * supply; the engine defines the shape and never the sources.
 */
export const visibilityCondition = z
  .object({
    /** e.g. "order.total", "customer.country". */
    source: z.string().min(1),
    operator: z.enum(["equals", "not-equals", "greater-than", "less-than", "exists", "empty"]),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  })
  .strict()

export const visibility = z
  .object({
    hidden: z.boolean().default(false),
    breakpoints: z.array(breakpoint).optional(),
    conditions: z.array(visibilityCondition).optional(),
  })
  .strict()

export const animation = z
  .object({
    type: z.string().min(1),
    trigger: z.enum(["load", "scroll", "hover", "click"]).default("load"),
    durationMs: z.number().int().nonnegative().max(60_000).optional(),
    delayMs: z.number().int().nonnegative().max(60_000).optional(),
    easing: z.string().optional(),
  })
  .strict()

/**
 * Editor-only information. Never affects rendering.
 */
export const nodeMetadata = z
  .object({
    locked: z.boolean().default(false),
    name: z.string().max(200).optional(),
    notes: z.string().max(2_000).optional(),
    tags: z.array(z.string().max(50)).max(50).optional(),
  })
  .strict()

export const node = z
  .object({
    id: nodeId,
    type: typeId,
    /** Null on the root, and only on the root. */
    parentId: nodeId.nullable(),
    /** Ordered. The renderer follows this order. */
    children: z.array(nodeId),
    props: props.default({}),
    styles: responsiveStyles.default({}),
    visibility: visibility.default({ hidden: false }),
    animations: z.array(animation).default([]),
    metadata: nodeMetadata.default({ locked: false }),
  })
  .strict()

export const themeReference = z
  .object({
    themeId: z.string().min(1),
    /** Sparse page-level token overrides. Usually empty. */
    overrides: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()

/**
 * A tracking integration, declared as data.
 *
 * Never as code: the schema contains no executable JavaScript, and the renderer
 * loads each integration from its provider's allowlisted origin. See
 * docs/security.md § Scripts on Checkout Pages.
 */
export const trackingIntegration = z
  .object({
    provider: z.string().min(1).max(64),
    id: z.string().min(1).max(200),
  })
  .strict()

export const pageSettings = z
  .object({
    currency: z.string().length(3).optional(),
    language: z.string().min(2).max(35).optional(),
    seo: z
      .object({
        title: z.string().max(200).optional(),
        description: z.string().max(500).optional(),
        image: assetReference.optional(),
        noIndex: z.boolean().optional(),
      })
      .strict()
      .optional(),
    favicon: assetReference.optional(),
    tracking: z.array(trackingIntegration).max(20).optional(),
    customCss: z.string().max(100_000).optional(),
  })
  .strict()

export const variableDefinition = z
  .object({
    /** e.g. "order.total", "customer.firstName". */
    source: z.string().min(1),
    type: z.enum(["string", "number", "currency", "date", "boolean"]),
    fallback: z.union([z.string(), z.number(), z.boolean()]).optional(),
  })
  .strict()

/** Semantic version, as `major.minor.patch`. */
export const schemaVersion = z.string().regex(/^\d+\.\d+\.\d+$/, "Expected major.minor.patch")

export const checkoutSchema = z
  .object({
    version: schemaVersion,
    projectId: z.string().min(1),
    pageId: z.string().min(1),
    theme: themeReference,
    settings: pageSettings.default({}),
    variables: z.record(z.string(), variableDefinition).default({}),
    root: nodeId,
    nodes: z.record(nodeId, node),
  })
  .strict()

export type Node = z.infer<typeof node>
export type NodeMetadata = z.infer<typeof nodeMetadata>
export type Visibility = z.infer<typeof visibility>
export type VisibilityCondition = z.infer<typeof visibilityCondition>
export type Animation = z.infer<typeof animation>
export type StyleProperties = z.infer<typeof styleProperties>
export type StateStyles = z.infer<typeof stateStyles>
export type ResponsiveStyles = z.infer<typeof responsiveStyles>
export type AssetReference = z.infer<typeof assetReference>
export type VariableReference = z.infer<typeof variableReference>
export type ThemeReference = z.infer<typeof themeReference>
export type TrackingIntegration = z.infer<typeof trackingIntegration>
export type PageSettings = z.infer<typeof pageSettings>
export type VariableDefinition = z.infer<typeof variableDefinition>
export type CheckoutSchema = z.infer<typeof checkoutSchema>

/** What the document looks like before defaults are applied. */
export type CheckoutSchemaInput = z.input<typeof checkoutSchema>
