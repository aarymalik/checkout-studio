import { z } from "zod"

/**
 * What an editable property is, as data.
 *
 * Every component ships a `properties.ts` and no component ships an inspector
 * panel — docs/architecture.md is explicit that the inspector is generated, and
 * docs/plugin-api.md that "the inspector builds itself dynamically". This is the
 * contract that makes that possible: a property is a description, and Phase 12
 * decides what a description looks like on screen.
 *
 * Validated rather than merely typed, because a plugin is third-party code.
 * A `select` with no options or a `min` above its `max` is a panel that renders
 * wrong at the moment somebody is trying to use it, and the registry is the
 * last place that can say so first.
 *
 * See docs/plugin-api.md § Property Registration and docs/component-library.md.
 */

/**
 * The inspector's sections, in the order the accordion shows them.
 *
 * Reconciled from two documents that disagreed. docs/ui-guidelines.md
 * § Inspector lists General and Effects; docs/plugin-api.md § Property
 * Registration lists Shadow where ui-guidelines says Effects. The UI document
 * wins on the sections, because it is the one describing the accordion, and
 * "Effects" subsumes Shadow.
 *
 * `Responsive` holds the engine's own per-breakpoint visibility controls, which
 * are a node concern rather than a component one — so no plugin property is
 * filed under it. It is in the list because it is a section of the panel.
 */
export const PROPERTY_GROUPS = [
  "General",
  "Layout",
  "Spacing",
  "Typography",
  "Background",
  "Border",
  "Effects",
  "Animation",
  "Responsive",
  "Accessibility",
  "Advanced",
] as const

export const propertyGroup = z.enum(PROPERTY_GROUPS)

/**
 * The kinds of control a property can ask for.
 *
 * Closed, and it grows one reviewed line at a time as components are built. An
 * open string would make a typo a control that silently fails to render, and a
 * speculative list of every control the catalog might eventually want would be
 * a vocabulary nothing speaks — docs/component-library.md names eighteen
 * distinct editable concepts across Phase 9 alone, and guessing their shapes
 * before writing the components that need them is how a schema ends up with
 * members no inspector knows how to draw.
 */
export const CONTROL_KINDS = [
  /** A length with a unit: `100%`, `64rem`, `auto`. */
  "dimension",
  /** Four sides at once, each a length. */
  "spacing",
  "color",
  /** Width, style and colour together. */
  "border",
  /** Four corners at once. */
  "radius",
  "shadow",
  /** One of a fixed list. Requires `options`. */
  "select",
  /**
   * A column count, stored as the CSS it means.
   *
   * `3` is written as `repeat(3, minmax(0, 1fr))`, and the control reads it
   * back. A count rather than the track list because that is what somebody
   * laying out a page is thinking about — and a style rather than a prop
   * because a grid has to be able to become one column on a phone, and the
   * document stores per-breakpoint overrides for styles only.
   *
   * `minmax(0, 1fr)` rather than `1fr`: a bare `1fr` floors at the content's
   * minimum size, so one long unbroken string makes its column wider than its
   * share and pushes the rest off the page.
   */
  "columns",
  /** An asset reference, resolved by the engine before the renderer sees it. */
  "asset",
  /** A single line. */
  "text",
  /** A bare number, with no unit to pick. A line height is `1.6`, not `1.6px`. */
  "number",
  /**
   * A CSS gradient.
   *
   * Its own kind rather than a text field, because the value is three
   * declarations once it reaches the page — a background image, a clip, and a
   * transparent colour — and the control is the only honest place to hide
   * that. A user picking two colours is not writing `linear-gradient`.
   */
  "gradient",
] as const

export const controlKind = z.enum(CONTROL_KINDS)

type ControlKindValue = (typeof CONTROL_KINDS)[number]

/** What a value may be. The same leaves a style or a prop can hold. */
const primitive = z.union([z.string(), z.number(), z.boolean(), z.null()])

/**
 * The controls whose value is a length, and so can carry a unit.
 *
 * Found by the schema's first use rather than by thinking about it: Section's
 * radius was refused for offering `px` and `rem`, which a radius plainly takes.
 * A colour and a shadow do not, and offering a unit picker beside either would
 * be a control that cannot be used.
 */
const LENGTH_CONTROLS = new Set<ControlKindValue>(["dimension", "spacing", "radius"])

export const propertyOption = z
  .object({ value: primitive, label: z.string().min(1).max(100) })
  .strict()

/**
 * Shows a property only when another one has a given value.
 *
 * Declarative rather than a predicate function, so that a property definition
 * stays something the AI assistant can read and a marketplace can inspect
 * without executing it.
 */
export const propertyCondition = z.object({ key: z.string().min(1), equals: primitive }).strict()

/**
 * Which bag the value is written to.
 *
 * A style goes into the node's `styles` and travels through the six-stage
 * cascade, which is what makes it responsive and stateful; a prop goes into
 * `props` and is handed to the component. Section's entire documented editable
 * list is styles, and Heading's `text` is a prop — the distinction is not
 * cosmetic, and a property that got it wrong would be written somewhere the
 * renderer never reads.
 */
export const propertyTarget = z.enum(["prop", "style"])

const base = z.object({
  /** The prop name, or the camelCase CSS property for a style. */
  key: z.string().min(1).max(100),
  target: propertyTarget,
  label: z.string().min(1).max(100),
  group: propertyGroup,
  control: controlKind,
  /** One sentence, shown beside the control. */
  help: z.string().min(1).max(300).optional(),
  options: z.array(propertyOption).min(1).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  /** Offered in the unit picker. The first is what a bare number means. */
  units: z.array(z.string().min(1)).min(1).optional(),
  /** Whether the inspector offers per-breakpoint overrides. Styles only. */
  responsive: z.boolean().default(false),
  /** Whether the inspector offers hover, focus, active and disabled. Styles only. */
  states: z.boolean().default(false),
  /** Folded into the Advanced section rather than shown with its group. */
  advanced: z.boolean().default(false),
  showWhen: propertyCondition.optional(),
})

export const propertyDefinition = base
  .strict()
  .refine((property) => property.control !== "select" || property.options !== undefined, {
    message: "A select property needs options.",
    path: ["options"],
  })
  .refine((property) => property.control === "select" || property.options === undefined, {
    message: "Only a select property takes options.",
    path: ["options"],
  })
  .refine((property) => property.units === undefined || LENGTH_CONTROLS.has(property.control), {
    message: `Only a length property takes units: ${[...LENGTH_CONTROLS].join(", ")}.`,
    path: ["units"],
  })
  .refine(
    (property) =>
      property.min === undefined || property.max === undefined || property.min <= property.max,
    {
      message: "A property's minimum cannot exceed its maximum.",
      path: ["min"],
    },
  )
  .refine((property) => property.target === "style" || (!property.responsive && !property.states), {
    /*
     * The schema stores responsive and state overrides for styles and not for
     * props — see `responsiveStyles` in packages/schema. A prop that claimed
     * to be responsive would offer the user a breakpoint override with
     * nowhere to put it.
     */
    message: "Only a style property can be responsive or stateful.",
    path: ["responsive"],
  })

/** Every property a component exposes. One key, once. */
export const propertyDefinitions = z
  .array(propertyDefinition)
  .superRefine((properties, context) => {
    const seen = new Set<string>()

    for (const [index, property] of properties.entries()) {
      const identity = `${property.target}:${property.key}`

      if (seen.has(identity)) {
        context.addIssue({
          code: "custom",
          message: `"${property.key}" is defined twice. The second one would win silently.`,
          path: [index, "key"],
        })
      }

      seen.add(identity)
    }
  })

export type PropertyGroup = z.infer<typeof propertyGroup>
export type ControlKind = z.infer<typeof controlKind>
export type PropertyTarget = z.infer<typeof propertyTarget>
export type PropertyOption = z.infer<typeof propertyOption>
export type PropertyCondition = z.infer<typeof propertyCondition>
export type PropertyDefinition = z.infer<typeof propertyDefinition>
/** What an author writes, before the booleans take their defaults. */
export type PropertyDefinitionInput = z.input<typeof propertyDefinition>

/**
 * Checks a component's property definitions, throwing on the first problem.
 *
 * Called by each component's own `properties.ts` at module scope, so a mistake
 * is a build-time failure in the plugin that made it rather than an inspector
 * that renders half a panel. Phase 9's integration tests require that "every
 * property definition validates against the property definition schema", and
 * this is how a component opts into that rather than being audited for it.
 */
export function defineProperties(
  definitions: readonly PropertyDefinitionInput[],
): readonly PropertyDefinition[] {
  return propertyDefinitions.parse(definitions)
}
