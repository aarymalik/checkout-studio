import { describe, expect, it } from "vitest"
import { primitives } from "../src/tokens/primitives"
import { COLOR_SEMANTICS, staticSemantics } from "../src/tokens/semantics"
import { componentTokens } from "../src/tokens/components"
import { light } from "../src/themes/light"
import { dark } from "../src/themes/dark"
import { highContrast } from "../src/themes/high-contrast"

const primitiveNames = new Set(Object.keys(primitives))
const colorSemanticNames = new Set<string>(COLOR_SEMANTICS)
const staticSemanticNames = new Set(Object.keys(staticSemantics))
const semanticNames = new Set([...colorSemanticNames, ...staticSemanticNames])

/** Every binding a theme can express, flattened to the primitives it names. */
function primitivesReferencedBy(binding: unknown): string[] {
  if (typeof binding === "string") return [binding]
  const { alphaOf, alpha } = binding as { alphaOf: string; alpha: string }
  return [alphaOf, alpha]
}

describe("the token graph", () => {
  it("resolves every colour semantic to a defined primitive, in every mode", () => {
    const themes = {
      light,
      dark,
      "light high-contrast": highContrast.light,
      "dark high-contrast": highContrast.dark,
    }

    const dangling: string[] = []

    for (const [themeName, theme] of Object.entries(themes)) {
      for (const [token, binding] of Object.entries(theme)) {
        for (const primitive of primitivesReferencedBy(binding)) {
          if (!primitiveNames.has(primitive)) dangling.push(`${themeName}: ${token} → ${primitive}`)
        }
      }
    }

    expect(dangling).toEqual([])
  })

  it("resolves every static semantic to a defined primitive", () => {
    const dangling = Object.entries(staticSemantics)
      .filter(([, primitive]) => !primitiveNames.has(primitive))
      .map(([token, primitive]) => `${token} → ${primitive}`)

    expect(dangling).toEqual([])
  })

  it("resolves every component token to a defined semantic, never to a primitive", () => {
    const wrong = Object.entries(componentTokens)
      .filter(([, target]) => !semanticNames.has(target))
      .map(([token, target]) => `${token} → ${target}`)

    expect(wrong).toEqual([])
  })

  it("keeps the tiers disjoint, so no token can reference itself", () => {
    const componentNames = new Set(Object.keys(componentTokens))

    const collisions = [
      ...[...primitiveNames].filter((name) => semanticNames.has(name)),
      ...[...semanticNames].filter((name) => componentNames.has(name)),
      ...[...primitiveNames].filter((name) => componentNames.has(name)),
    ]

    // A shared name emits `--cs-x: var(--cs-x)`, which CSS treats as invalid
    // at computed-value time: the token silently stops working.
    expect(collisions).toEqual([])
  })

  it("resolves nothing in more than three hops", () => {
    // Component token → semantic → primitive → value is the longest chain the
    // tiers permit, and the previous tests prove each hop lands. A fourth hop
    // could only appear if a primitive pointed at another token.
    const primitivesPointingAtTokens = Object.entries(primitives).filter(([, value]) =>
      value.includes("var("),
    )

    expect(primitivesPointingAtTokens).toEqual([])
  })

  it("rebinds only semantics when the mode changes", () => {
    // Dark mode is a different set of bindings for the same names, never a
    // different set of names — that is what lets a component ignore mode.
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort())
    expect(Object.keys(light).sort()).toEqual([...COLOR_SEMANTICS].sort())
  })

  it("keeps high contrast a sparse override of tokens the mode already defines", () => {
    for (const mode of ["light", "dark"] as const) {
      const overrides = Object.keys(highContrast[mode])

      expect(overrides.length).toBeGreaterThan(0)
      expect(overrides.every((token) => colorSemanticNames.has(token))).toBe(true)
      expect(overrides.length).toBeLessThan(COLOR_SEMANTICS.length)
    }
  })

  it("keeps every duration inside the 150–220ms range CLAUDE.md fixes", () => {
    const durations = Object.entries(primitives)
      .filter(([name]) => name.startsWith("duration-"))
      .map(([, value]) => Number.parseInt(value, 10))

    expect(durations.length).toBeGreaterThan(0)
    for (const duration of durations) {
      expect(duration).toBeGreaterThanOrEqual(150)
      expect(duration).toBeLessThanOrEqual(220)
    }
  })
})
