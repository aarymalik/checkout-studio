import { primitives } from "../tokens/primitives"
import type { PrimitiveName } from "../tokens/primitives"
import { componentTokens } from "../tokens/components"
import { COLOR_SEMANTICS, staticSemantics } from "../tokens/semantics"
import type { ColorTheme, SemanticBinding } from "../tokens/semantics"
import { light } from "../themes/light"
import { dark } from "../themes/dark"
import { highContrast } from "../themes/high-contrast"

/**
 * Compiles the token tiers into CSS custom properties.
 *
 * The emitted file is committed rather than built on demand: it is imported by
 * every application's stylesheet, and a stylesheet that only exists after a
 * generator has run is a stylesheet that will one day be missing. A test
 * asserts the committed file matches this output, so the two cannot drift.
 */

/**
 * Every Studio variable carries this prefix.
 *
 * It keeps our variables distinct from Tailwind's own `--color-*` namespace —
 * without it, binding a utility to a token of the same name is a circular
 * reference — and mirrors the `--ck-` prefix the checkout theme uses for the
 * same reason (docs/theme-system.md § CSS Variable Generation).
 */
export const PREFIX = "--cs-"

const INDENT = "  "

function variable(name: string): string {
  return `${PREFIX}${name}`
}

function reference(name: string): string {
  return `var(${variable(name)})`
}

/** Renders one semantic binding as the right-hand side of a declaration. */
export function renderBinding(binding: SemanticBinding): string {
  if (typeof binding === "string") return reference(binding)

  return `color-mix(in oklab, ${reference(binding.alphaOf)} ${reference(binding.alpha)}, transparent)`
}

function block(selector: string, declarations: readonly string[], comment?: string): string {
  const head = comment ? `/* ${comment} */\n` : ""
  return `${head}${selector} {\n${declarations.map((line) => INDENT + line).join("\n")}\n}`
}

function declarations(entries: ReadonlyArray<readonly [string, string]>): readonly string[] {
  return entries.map(([name, value]) => `${variable(name)}: ${value};`)
}

function colorDeclarations(theme: Partial<ColorTheme>): readonly string[] {
  return declarations(
    COLOR_SEMANTICS.filter((name) => theme[name] !== undefined).map(
      (name) => [name, renderBinding(theme[name] as SemanticBinding)] as const,
    ),
  )
}

/** The complete stylesheet. */
export function generateVariablesCss(): string {
  const sections = [
    `/*
 * Studio design tokens — GENERATED FILE, DO NOT EDIT.
 *
 * Source: packages/design-system/src/tokens and src/themes.
 * Regenerate: pnpm --filter @checkout-studio/design-system tokens:build
 *
 * Tier 1 primitives hold values. Tier 2 semantics give them meaning and are
 * the only tier a component may read. Tier 3 component tokens resolve to
 * semantics. Switching mode rebinds tier 2 and nothing else.
 */`,

    block(
      ":root",
      declarations(
        (Object.keys(primitives) as PrimitiveName[]).map(
          (name) => [name, primitives[name]] as const,
        ),
      ),
      "Tier 1 — primitives. Raw values, no meaning. Never read by a component.",
    ),

    block(
      ":root",
      declarations(
        (Object.keys(staticSemantics) as Array<keyof typeof staticSemantics>).map(
          (name) => [name, reference(staticSemantics[name])] as const,
        ),
      ),
      "Tier 2 — semantics that carry no colour and so do not change with mode.",
    ),

    block(
      ":root",
      colorDeclarations(light),
      "Tier 2 — colour, light mode. The default, so an unresolved document still paints.",
    ),

    block('[data-theme="dark"]', colorDeclarations(dark), "Tier 2 — colour, dark mode."),

    block(
      '[data-theme="light"][data-contrast="high"]',
      colorDeclarations(highContrast.light),
      "High contrast. A sparse override of the active mode, not a third palette.",
    ),

    block('[data-theme="dark"][data-contrast="high"]', colorDeclarations(highContrast.dark)),

    block(
      ":root",
      declarations(
        (Object.keys(componentTokens) as Array<keyof typeof componentTokens>).map(
          (name) => [name, reference(componentTokens[name])] as const,
        ),
      ),
      "Tier 3 — component tokens. Each resolves to a semantic, never to a primitive.",
    ),

    `/* Motion collapses to nothing when the reader asks for less of it. No
 * component needs to know: every duration in the product reads these three. */
@media (prefers-reduced-motion: reduce) {
${INDENT}:root {
${INDENT}${INDENT}${variable("duration-fast")}: 0ms;
${INDENT}${INDENT}${variable("duration-normal")}: 0ms;
${INDENT}${INDENT}${variable("duration-slow")}: 0ms;
${INDENT}}
}`,
  ]

  return `${sections.join("\n\n")}\n`
}
