/**
 * @checkout-studio/design-system — Studio design tokens and themes.
 *
 * The product interface is built entirely from these tokens. A component reads
 * semantics; primitives exist only for semantics to resolve to. See
 * docs/theme-system.md.
 *
 * The stylesheets are exported as subpaths rather than from here, because CSS
 * is imported by an application's stylesheet, not by its JavaScript:
 *
 *   @import "@checkout-studio/design-system/css/variables.css";
 *   @import "@checkout-studio/design-system/tailwind/tokens.css";
 *   @import "@checkout-studio/design-system/css/reset.css";
 */

export { primitives } from "./tokens/primitives"
export type { PrimitiveName } from "./tokens/primitives"

export { COLOR_SEMANTICS, CONTRAST_PAIRINGS, staticSemantics } from "./tokens/semantics"
export type {
  ColorSemanticName,
  ColorTheme,
  SemanticBinding,
  SemanticName,
  StaticSemanticName,
} from "./tokens/semantics"

export { componentTokens } from "./tokens/components"
export type { ComponentTokenName } from "./tokens/components"

export { light } from "./themes/light"
export { dark } from "./themes/dark"
export { highContrast } from "./themes/high-contrast"

export { bindingsFor, resolveColor } from "./tokens/resolve"
export type { Contrast, Mode } from "./tokens/resolve"

export { AA, contrastRatio, contrastRatioRounded, relativeLuminance } from "./color/contrast"

export { generateVariablesCss, PREFIX } from "./css/generate"

export { themeScript } from "./theme/script"
export { applyTheme, setThemePreference, watchSystemPreferences } from "./theme/apply"
export {
  CONTRAST_ATTRIBUTE,
  CONTRAST_STORAGE_KEY,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
  isContrastPreference,
  isThemePreference,
  resolveContrast,
  resolveMode,
} from "./theme/preferences"
export type {
  ContrastPreference,
  ResolvedContrast,
  ResolvedMode,
  ThemePreference,
} from "./theme/preferences"
