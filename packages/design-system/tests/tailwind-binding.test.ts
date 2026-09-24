import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { primitives } from "../src/tokens/primitives"
import { COLOR_SEMANTICS, staticSemantics } from "../src/tokens/semantics"

const read = (path: string): string =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")

const binding = read("../src/tailwind/tokens.css")
const variables = read("../src/css/variables.css")

const referenced = [...binding.matchAll(/var\((--cs-[a-z0-9-]+)\)/g)].map(
  (match) => match[1] as string,
)

describe("the Tailwind binding", () => {
  it("references only variables the token sheet declares", () => {
    const declared = new Set(
      [...variables.matchAll(/^\s*(--cs-[a-z0-9-]+):/gm)].map((match) => match[1] as string),
    )

    expect([...new Set(referenced)].filter((name) => !declared.has(name))).toEqual([])
  })

  it("binds utilities to semantics only, never to a primitive", () => {
    // A utility bound to `--cs-blue-600` would keep its colour through a mode
    // switch, which is the one thing the semantic tier exists to prevent.
    const primitiveNames = new Set(Object.keys(primitives).map((name) => `--cs-${name}`))

    const reachingPastTheTier = [...new Set(referenced)].filter((name) => primitiveNames.has(name))

    expect(reachingPastTheTier).toEqual([])
  })

  it("exposes every colour semantic as a utility", () => {
    // A semantic nothing can reach is a semantic nobody will use, and the
    // component that needs it will reach for an arbitrary value instead.
    const missing = COLOR_SEMANTICS.filter((name) => !binding.includes(`var(--cs-${name})`))

    expect(missing).toEqual([])
  })

  it("exposes the radius, elevation and type semantics", () => {
    const roles = Object.keys(staticSemantics).filter(
      (name) =>
        name.startsWith("radius-") || name.startsWith("shadow-") || name.startsWith("font-"),
    )

    expect(roles.filter((name) => !binding.includes(`var(--cs-${name})`))).toEqual([])
  })

  it("names utilities after meaning rather than value", () => {
    // `--color-gray-0` would generate `bg-gray-0`, and a component written
    // against it is a component that has opted out of theming.
    const utilityNames = [
      ...binding.matchAll(/^\s*(--(?:color|radius|shadow|text|font)-[a-z0-9-]+):/gm),
    ]
      .map((match) => match[1] as string)
      .filter((name) => !name.endsWith("--line-height"))

    const valueShaped = utilityNames.filter((name) =>
      /-(?:gray|blue|green|amber|red)-\d+$|-\d+$/.test(name),
    )

    expect(valueShaped).toEqual([])
  })

  it("collapses motion through tokens rather than per component", () => {
    for (const utility of ["duration-fast", "duration-normal", "duration-slow"]) {
      expect(binding).toContain(`@utility ${utility}`)
    }
  })
})
