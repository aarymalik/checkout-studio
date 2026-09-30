/**
 * @checkout-studio/schema — the checkout document and its operations.
 *
 * The one language the editor and the renderer share. Pure: no React, no DOM,
 * no server, and no knowledge of what a component is. Every rule specific to a
 * component arrives through a registry.
 *
 * See docs/schema.md.
 */

export {
  BREAKPOINTS,
  STATES,
  UNSUPPORTED_TYPE,
  checkoutSchema,
  node as nodeSchema,
  typeId,
} from "./document/schema"
export type {
  Animation,
  AssetReference,
  Breakpoint,
  CheckoutSchema,
  CheckoutSchemaInput,
  Node,
  NodeMetadata,
  PageSettings,
  PropValue,
  ResponsiveStyles,
  StateStyles,
  StyleProperties,
  StyleState,
  ThemeReference,
  TrackingIntegration,
  VariableDefinition,
  VariableReference,
  Visibility,
  VisibilityCondition,
} from "./document/schema"

export { CURRENT_VERSION, ROOT_TYPE, createDocument, rehome } from "./document/create"

export { createId, prefixFor } from "./document/ids"
export type { RandomSource } from "./document/ids"

export { parseDocument, validate, validateReferences } from "./document/validate"
export type {
  ComponentValidator,
  ProblemCode,
  SchemaProblem,
  ValidateOptions,
  ValidationResult,
} from "./document/validate"

export { canonicalJson, equivalent, normalize } from "./document/normalize"
export { diff, summarize, unchanged } from "./document/diff"
export type { DocumentDiff } from "./document/diff"
export { deserialize, serialize } from "./document/serialize"
export type { DeserializeOptions, DeserializeResult } from "./document/serialize"

export { MigrationError, MigrationRegistry, compareVersions } from "./migrate/registry"
export type { Migration } from "./migrate/registry"
export { canMigrate, migrate } from "./migrate/migrate"
export type { MigrationOutcome } from "./migrate/migrate"

export { createNode, extract, regenerateIds } from "./tree/fragment"
export type { Fragment } from "./tree/fragment"

export { ancestors, collect, isDescendant, siblings, subtreeIds, traverse } from "./tree/traverse"
export type { VisitContext } from "./tree/traverse"

export { duplicate, insert, move, remove, unwrap, update, wrap } from "./tree/operations"
export type {
  DuplicateResult,
  TreeErrorCode,
  TreeFailure,
  TreeOptions,
  TreeResult,
} from "./tree/operations"

export {
  DEFAULT_THEME_ID,
  MAX_INHERITANCE_DEPTH,
  TYPE_SCALE_STEPS,
  checkoutTheme,
  componentThemeSlot,
  defaultTheme,
  flatten,
  fontDefinition,
  isColor,
  isDuration,
  isEasing,
  isFontFamily,
  isLength,
  isSafeCssValue,
  isShadow,
  isTokenReference,
  mergeDeep,
  storedTheme,
  themeColors,
  themeDarkOverrides,
  themeGroups,
  themeMetadata,
  themeMotion,
  themeRadius,
  themeShadows,
  themeSpacing,
  themeTypography,
  themeVersion,
  tokenPath,
  typeScale,
  typeStyle,
  validateTheme,
} from "./theme"
export type {
  CheckoutTheme,
  CheckoutThemeInput,
  ComponentThemeSlot,
  FontDefinition,
  FontSource,
  InheritErrorCode,
  InheritFailure,
  InheritResult,
  InheritSuccess,
  StoredTheme,
  ThemeColors,
  ThemeDarkOverrides,
  ThemeGroups,
  ThemeMetadata,
  ThemeMotion,
  ThemeProblem,
  ThemeRadius,
  ThemeShadows,
  ThemeSpacing,
  ThemeTypography,
  TypeScale,
  TypeScaleStep,
  TypeStyle,
} from "./theme"
