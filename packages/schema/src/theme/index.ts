/**
 * The checkout theme.
 *
 * The user's design decisions as data: what a checkout looks like, separate
 * from what it contains. See docs/theme-system.md.
 */

export {
  TYPE_SCALE_STEPS,
  checkoutTheme,
  componentThemeSlot,
  fontDefinition,
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
  typeScale,
  typeStyle,
} from "./types"

export type {
  CheckoutTheme,
  CheckoutThemeInput,
  ComponentThemeSlot,
  FontDefinition,
  FontSource,
  StoredTheme,
  ThemeColors,
  ThemeDarkOverrides,
  ThemeGroups,
  ThemeMetadata,
  ThemeMotion,
  ThemeRadius,
  ThemeShadows,
  ThemeSpacing,
  ThemeTypography,
  TypeScale,
  TypeScaleStep,
  TypeStyle,
} from "./types"

export { DEFAULT_THEME_ID, defaultTheme } from "./defaults"

export {
  isColor,
  isDuration,
  isEasing,
  isFontFamily,
  isLength,
  isSafeCssValue,
  isShadow,
  validateTheme,
} from "./validate"
export type { ThemeProblem } from "./validate"

export { MAX_INHERITANCE_DEPTH, flatten, mergeDeep } from "./inherit"
export type { InheritErrorCode, InheritFailure, InheritResult, InheritSuccess } from "./inherit"
