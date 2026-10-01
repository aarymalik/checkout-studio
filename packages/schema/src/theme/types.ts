import { z } from "zod"

import { breakpoint } from "../document/schema"

/**
 * The checkout theme — the user's design decisions, compressed into named values.
 *
 * This is the *checkout* theme, not the Studio theme. The Studio theme lives in
 * `@checkout-studio/design-system` and styles the product interface; this one
 * lives in the data and styles what a customer sees. They share mechanics and
 * nothing else. Confusing the two is how a user's brand colour ends up tinting
 * our toolbar. See docs/theme-system.md § Overview.
 *
 * It lives in the schema package rather than in the renderer because everything
 * needs it: the API validates one on write, the editor edits one, the publish
 * step snapshots one into a revision, and the renderer compiles one to CSS. The
 * schema package is the only layer all of those may import.
 *
 * Declared as Zod and inferred into TypeScript, for the reason given in
 * document/schema.ts: a hand-written interface beside a separate validator
 * drifts.
 */

/** Semantic version, as `major.minor.patch`. Themes version independently of the schema. */
export const themeVersion = z.string().regex(/^\d+\.\d+\.\d+$/, "Expected major.minor.patch")

export const fontSource = z.enum(["google", "system", "custom"])

/**
 * A font family the theme asks for.
 *
 * `weights` is what the theme *offers*. What a page actually loads is the subset
 * the nodes reference, computed by the renderer — see styles/fonts.ts.
 */
export const fontDefinition = z
  .object({
    family: z.string().min(1).max(100),
    source: fontSource,
    /** CSS numeric weights. A variable font is declared as its full range's endpoints. */
    weights: z.array(z.number().int().min(1).max(1000)).min(1).max(12),
    /** The asset holding the font file. Required when the family is self-hosted. */
    assetId: z.string().min(1).optional(),
    fallback: z.array(z.string().min(1).max(100)).max(10),
  })
  .strict()
  .refine((value) => value.source !== "custom" || value.assetId !== undefined, {
    message: "A custom font must name the asset holding its file.",
    path: ["assetId"],
  })

export const textTransform = z.enum(["none", "uppercase", "lowercase", "capitalize"])

export const typeStyle = z
  .object({
    fontSize: z.string().min(1).max(64),
    lineHeight: z.string().min(1).max(64),
    letterSpacing: z.string().min(1).max(64),
    fontWeight: z.number().int().min(1).max(1000),
    textTransform: textTransform.optional(),
  })
  .strict()

export const themeColors = z
  .object({
    /** The brand seed. Scales derive from it. */
    primary: z.string().min(1).max(64),
    primaryForeground: z.string().min(1).max(64),

    background: z.string().min(1).max(64),
    surface: z.string().min(1).max(64),
    surfaceRaised: z.string().min(1).max(64),

    foreground: z.string().min(1).max(64),
    foregroundMuted: z.string().min(1).max(64),

    border: z.string().min(1).max(64),
    borderStrong: z.string().min(1).max(64),

    success: z.string().min(1).max(64),
    warning: z.string().min(1).max(64),
    danger: z.string().min(1).max(64),

    focusRing: z.string().min(1).max(64),

    /** Colours the user named themselves. Referenced as `{colors.custom.mint}`. */
    custom: z.record(z.string().min(1).max(64), z.string().min(1).max(64)).default({}),
  })
  .strict()

export const TYPE_SCALE_STEPS = [
  "display",
  "h1",
  "h2",
  "h3",
  "h4",
  "bodyLarge",
  "body",
  "small",
  "caption",
] as const

export const typeScale = z
  .object({
    display: typeStyle,
    h1: typeStyle,
    h2: typeStyle,
    h3: typeStyle,
    h4: typeStyle,
    bodyLarge: typeStyle,
    body: typeStyle,
    small: typeStyle,
    caption: typeStyle,
  })
  .strict()

export const themeTypography = z
  .object({
    fontFamily: z
      .object({ heading: fontDefinition, body: fontDefinition, mono: fontDefinition })
      .strict(),
    scale: typeScale,
    /** Multiplies every size in the scale, per breakpoint. */
    fluidScale: z.record(breakpoint, z.number().positive().max(4)),
  })
  .strict()

export const themeSpacing = z
  .object({
    /** Base unit in px. */
    base: z.number().positive().max(64),
    /** Multiples of `base`, indexable as `{spacing.6}`. */
    scale: z.array(z.number().nonnegative().max(1_000)).min(1).max(32),
    /** Multiplies the whole scale, per breakpoint. Global density control. */
    density: z.record(breakpoint, z.number().positive().max(4)),
  })
  .strict()

export const themeRadius = z
  .object({
    none: z.string().min(1).max(64),
    sm: z.string().min(1).max(64),
    md: z.string().min(1).max(64),
    lg: z.string().min(1).max(64),
    full: z.string().min(1).max(64),
  })
  .strict()

export const themeShadows = z
  .object({
    none: z.string().min(1).max(256),
    sm: z.string().min(1).max(256),
    md: z.string().min(1).max(256),
    lg: z.string().min(1).max(256),
    xl: z.string().min(1).max(256),
  })
  .strict()

/**
 * Durations are bounded by the range CLAUDE.md fixes for the product: nothing
 * animates outside 150–220ms, so a theme cannot introduce a slower motion
 * language than the design system permits.
 */
export const themeMotion = z
  .object({
    durationFast: z.string().min(1).max(32),
    durationNormal: z.string().min(1).max(32),
    durationSlow: z.string().min(1).max(32),
    easing: z.string().min(1).max(128),
  })
  .strict()

/**
 * A component's theme values.
 *
 * Opaque to the engine on purpose. The shape of `core.button`'s slot is the core
 * plugin's business, and `checkout.payment-element`'s is the checkout plugin's;
 * each registers a Zod schema for its own slot through plugin-sdk, and the
 * engine validates against whatever it was given. That is what lets a second
 * product add slots without the engine changing.
 */
export const componentThemeSlot = z.record(z.string().min(1).max(64), z.unknown())

export const themeMetadata = z
  .object({
    author: z.string().max(200).optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    isPreset: z.boolean().default(false),
    presetId: z.string().min(1).optional(),
    tags: z.array(z.string().max(50)).max(50).default([]),
  })
  .strict()

/**
 * A sparse set of theme values.
 *
 * Every group is optional and every field within it is optional, which serves
 * two purposes with one shape:
 *
 *   - dark mode, which is an override layer and not a second theme: a theme
 *     that only inverts its surfaces stores only its surfaces
 *   - an inherited theme, which stores only what it changes about its parent
 *
 * If either grows to the size of a full theme, the semantic layer is wrong —
 * see docs/theme-system.md § Dark Mode.
 */
const typeStylePartial = typeStyle.partial()

export const themeGroups = z
  .object({
    colors: themeColors.partial().optional(),
    typography: z
      .object({
        fontFamily: z
          .object({
            heading: fontDefinition.optional(),
            body: fontDefinition.optional(),
            mono: fontDefinition.optional(),
          })
          .strict()
          .optional(),
        scale: z
          .object({
            display: typeStylePartial.optional(),
            h1: typeStylePartial.optional(),
            h2: typeStylePartial.optional(),
            h3: typeStylePartial.optional(),
            h4: typeStylePartial.optional(),
            bodyLarge: typeStylePartial.optional(),
            body: typeStylePartial.optional(),
            small: typeStylePartial.optional(),
            caption: typeStylePartial.optional(),
          })
          .strict()
          .optional(),
        fluidScale: z.partialRecord(breakpoint, z.number().positive().max(4)).optional(),
      })
      .strict()
      .optional(),
    spacing: z
      .object({
        base: z.number().positive().max(64).optional(),
        scale: z.array(z.number().nonnegative().max(1_000)).min(1).max(32).optional(),
        density: z.partialRecord(breakpoint, z.number().positive().max(4)).optional(),
      })
      .strict()
      .optional(),
    radius: themeRadius.partial().optional(),
    shadows: themeShadows.partial().optional(),
    motion: themeMotion.partial().optional(),
    components: z.record(z.string().min(1).max(64), componentThemeSlot).optional(),
  })
  .strict()

/** Dark mode overrides. The same sparse shape, read at a different time. */
export const themeDarkOverrides = themeGroups

export const checkoutTheme = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string().min(1).max(200),
    version: themeVersion,

    /** Parent theme id. Resolved into a flat theme before render. */
    extends: z.string().min(1).max(64).optional(),

    colors: themeColors,
    typography: themeTypography,
    spacing: themeSpacing,
    radius: themeRadius,
    shadows: themeShadows,
    motion: themeMotion,
    /** Keyed by component type id. */
    components: z.record(z.string().min(1).max(64), componentThemeSlot).default({}),

    dark: themeDarkOverrides.optional(),

    metadata: themeMetadata,
  })
  .strict()

/**
 * A theme as it is stored.
 *
 * The root of an inheritance chain holds every value; a theme that `extends`
 * another holds only its deltas. Flattening the chain produces a
 * `checkoutTheme`, which is what the renderer receives — it never walks a chain
 * at render time. See inherit.ts.
 */
export const storedTheme = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string().min(1).max(200),
    version: themeVersion,
    extends: z.string().min(1).max(64).optional(),
    dark: themeDarkOverrides.optional(),
    metadata: themeMetadata,
  })
  .extend(themeGroups.shape)
  .strict()

export type FontSource = z.infer<typeof fontSource>
export type FontDefinition = z.infer<typeof fontDefinition>
export type TypeStyle = z.infer<typeof typeStyle>
export type TypeScale = z.infer<typeof typeScale>
export type TypeScaleStep = (typeof TYPE_SCALE_STEPS)[number]
export type ThemeColors = z.infer<typeof themeColors>
export type ThemeTypography = z.infer<typeof themeTypography>
export type ThemeSpacing = z.infer<typeof themeSpacing>
export type ThemeRadius = z.infer<typeof themeRadius>
export type ThemeShadows = z.infer<typeof themeShadows>
export type ThemeMotion = z.infer<typeof themeMotion>
export type ComponentThemeSlot = z.infer<typeof componentThemeSlot>
export type ThemeMetadata = z.infer<typeof themeMetadata>
export type ThemeGroups = z.infer<typeof themeGroups>
export type ThemeDarkOverrides = z.infer<typeof themeDarkOverrides>
export type StoredTheme = z.infer<typeof storedTheme>
export type CheckoutTheme = z.infer<typeof checkoutTheme>

/** What a theme looks like before defaults are applied. */
export type CheckoutThemeInput = z.input<typeof checkoutTheme>
