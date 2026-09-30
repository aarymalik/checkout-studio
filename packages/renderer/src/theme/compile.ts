import { isSafeCssValue, isTokenReference, tokenPath } from "@checkout-studio/schema"
import type { Breakpoint, CheckoutTheme, ThemeGroups } from "@checkout-studio/schema"

import { BREAKPOINT_MAX_WIDTH, NARROW_BREAKPOINTS } from "../styles/breakpoints"
import { ROOT_CLASS, isLengthToken, readToken, tokenPaths, variableFor } from "./variables"

/**
 * Theme → CSS custom properties.
 *
 * Compiled once per theme version, scoped to `.checkout-root`, and never to
 * `:root`. The scope is what lets the editor canvas render a checkout inside the
 * Studio document without the two themes reaching into each other, and it is
 * the reason a user's brand colour cannot tint our toolbar.
 *
 * Nodes then reference variables rather than values, which is the single most
 * important optimisation in the system: a theme edit rewrites a few dozen
 * declarations instead of re-rendering thousands of elements. A 2,000-node tree
 * repaints in one frame because React is not involved.
 *
 * The only question asked of a value here is whether it can escape the
 * declaration it lands in. Whether it is actually a colour, a length or a
 * shadow is asked by the theme's own validation in the schema package, which
 * `prepare` runs before render and reports as a warning — because a theme with
 * one meaningless shadow should still produce a checkout.
 *
 * See docs/theme-system.md § CSS Variable Generation.
 */

export interface CompileOptions {
  /**
   * Compile for one breakpoint instead of all three.
   *
   * The canvas renders a device frame inside a browser window of some other
   * width, so a media query there fires on the wrong number: a 1440px desktop
   * frame inside a 900px window would pick up the tablet density. Resolving the
   * breakpoint here instead is the same decision the style cascade makes for
   * the same reason.
   */
  breakpoint?: Breakpoint | undefined
}

export interface CompiledTheme {
  /** `themeId:version`, plus the breakpoint when one was resolved. */
  key: string
  /** The whole stylesheet: base block, breakpoint blocks, dark block. */
  css: string
  /** Values that failed validation and were left out, for reporting. */
  rejected: readonly { path: string; value: string }[]
}

/** A declaration, already checked. */
interface Declaration {
  variable: string
  value: string
}

/**
 * A theme value as CSS.
 *
 * A reference becomes `var(--ck-…)` so the chain resolves in the browser rather
 * than here — which also means a two-step alias costs nothing, and a cycle is
 * CSS's problem rather than a hang in ours. Resolvability is checked before
 * render; see styles/tokens.ts.
 */
function declarationFor(
  theme: CheckoutTheme,
  path: string,
  variable: string,
  raw: string | number,
): Declaration | null {
  if (typeof raw === "number") {
    return { variable, value: isLengthToken(path) ? `${raw}px` : `${raw}` }
  }

  if (isTokenReference(raw)) {
    const target = tokenPath(raw) as string
    const targetVariable = variableFor(target)

    // The path has to *name* something as well as be shaped like a path.
    // `{colors.primry}` is a well-formed reference to nothing, and emitting
    // `var(--ck-color-primry)` would render an invisible element with no error
    // anywhere.
    if (targetVariable === null || readToken(theme, target) === undefined) return null

    return { variable, value: `var(${targetVariable})` }
  }

  return isSafeCssValue(raw) ? { variable, value: raw } : null
}

/**
 * Spacing and type size are the two things a theme scales globally per
 * breakpoint, so their variables are the only ones redeclared in a media query.
 * Everything else is declared once.
 */
function scaled(theme: CheckoutTheme, breakpoint: Breakpoint): readonly Declaration[] {
  const declarations: Declaration[] = []
  const density = theme.spacing.density[breakpoint]
  const fluid = theme.typography.fluidScale[breakpoint]

  if (density !== 1) {
    for (const [index, step] of theme.spacing.scale.entries()) {
      declarations.push({
        variable: variableOf(`spacing.${index}`),
        value: `${round(step * density)}px`,
      })
    }
  }

  if (fluid !== 1) {
    for (const [step, style] of Object.entries(theme.typography.scale)) {
      const px = pixelsOf(style.fontSize)

      if (px !== null) {
        declarations.push({
          variable: variableOf(`typography.scale.${step}.fontSize`),
          value: `${round(px * fluid)}px`,
        })
      }
    }
  }

  return declarations
}

/**
 * The variable for a path the theme is known to hold.
 *
 * Every path this module builds comes from the theme's own shape — a spacing
 * index, a type-scale step, a colour role — and every one of them translates.
 * The invariant is asserted directly in tests/theme.test.ts ("enumerates every
 * path the theme offers"), which is a better place for it than an unreachable
 * branch here pretending otherwise.
 */
function variableOf(path: string): string {
  return variableFor(path) as string
}

/** A px length as a number, or null when the value is in some other unit. */
function pixelsOf(value: string): number | null {
  const match = /^(\d+(?:\.\d+)?)px$/.exec(value.trim())

  return match === null ? null : Number(match[1])
}

/** Two decimal places, with no trailing zeroes. A scaled 13px is 12.35px, not 12.350000000000001px. */
function round(value: number): number {
  return Math.round(value * 100) / 100
}

function block(selector: string, declarations: readonly Declaration[]): string {
  if (declarations.length === 0) return ""

  const body = declarations
    .map((declaration) => `  ${declaration.variable}: ${declaration.value};`)
    .join("\n")

  return `${selector} {\n${body}\n}\n`
}

/**
 * The dark layer, sparse.
 *
 * Only the variables the override actually sets. A dark block the size of the
 * light theme means the semantic layer is wrong, and emitting one would also
 * cost every visitor the bytes.
 */
function darkDeclarations(
  theme: CheckoutTheme,
  dark: ThemeGroups,
  rejected: { path: string; value: string }[],
): readonly Declaration[] {
  const declarations: Declaration[] = []

  const groups: [keyof ThemeGroups, Record<string, unknown> | undefined][] = [
    ["colors", dark.colors],
    ["radius", dark.radius],
    ["shadows", dark.shadows],
    ["motion", dark.motion],
  ]

  for (const [group, values] of groups) {
    for (const [key, value] of Object.entries(values ?? {})) {
      if (typeof value !== "string" && typeof value !== "number") continue

      const path = `${group}.${key}`
      const declaration = declarationFor(theme, path, variableOf(path), value)

      if (declaration === null) {
        rejected.push({ path: `dark.${path}`, value: String(value) })
        continue
      }

      declarations.push(declaration)
    }
  }

  for (const [key, value] of Object.entries(dark.colors?.custom ?? {})) {
    const path = `colors.custom.${key}`
    const declaration = declarationFor(theme, path, variableOf(path), value)

    if (declaration === null) {
      rejected.push({ path: `dark.${path}`, value })
      continue
    }

    declarations.push(declaration)
  }

  return declarations
}

const cache = new Map<string, CompiledTheme>()

/**
 * Compiles a theme, memoised on `themeId:version`.
 *
 * Editing a theme bumps its patch version, so the key changes exactly when the
 * output would. The cache is module-level rather than per-render because the
 * same theme is compiled by every page of a project and by every request for a
 * published one.
 */
export function compileTheme(theme: CheckoutTheme, options: CompileOptions = {}): CompiledTheme {
  const key = `${theme.id}:${theme.version}${
    options.breakpoint === undefined ? "" : `:${options.breakpoint}`
  }`
  const cached = cache.get(key)

  if (cached !== undefined) return cached

  const compiled = compile(theme, key, options.breakpoint)
  cache.set(key, compiled)

  return compiled
}

/** Empties the memo. Tests need it; nothing in production does. */
export function clearThemeCache(): void {
  cache.clear()
}

function compile(
  theme: CheckoutTheme,
  key: string,
  breakpoint: Breakpoint | undefined,
): CompiledTheme {
  const rejected: { path: string; value: string }[] = []
  const base: Declaration[] = []

  for (const path of tokenPaths(theme)) {
    const raw = readToken(theme, path)
    if (raw === undefined) continue

    const declaration = declarationFor(theme, path, variableOf(path), raw)

    if (declaration === null) {
      rejected.push({ path, value: String(raw) })
      continue
    }

    base.push(declaration)
  }

  const root = `.${ROOT_CLASS}`

  // One breakpoint: its scaled values go straight into the base block, where no
  // query can second-guess them. All three: the two narrow ones are queries,
  // because the server does not know the visitor's width.
  let css = block(root, breakpoint === undefined ? base : [...base, ...scaled(theme, breakpoint)])

  if (breakpoint === undefined) {
    for (const narrow of NARROW_BREAKPOINTS) {
      const declarations = scaled(theme, narrow)
      if (declarations.length === 0) continue

      css += `@media (max-width: ${BREAKPOINT_MAX_WIDTH[narrow]}px) {\n${indent(
        block(root, declarations),
      )}}\n`
    }
  }

  if (theme.dark !== undefined) {
    css += block(`${root}[data-mode="dark"]`, darkDeclarations(theme, theme.dark, rejected))
  }

  return { key, css, rejected }
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => (line === "" ? line : `  ${line}`))
    .join("\n")
}
