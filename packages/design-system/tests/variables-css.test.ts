import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { generateVariablesCss, PREFIX } from "../src/css/generate"
import { COLOR_SEMANTICS } from "../src/tokens/semantics"

const committed = readFileSync(
  fileURLToPath(new URL("../src/css/variables.css", import.meta.url)),
  "utf8",
)

/** Every `--cs-name: value;` declaration in the sheet, in order. */
function declarations(css: string): Array<{ name: string; value: string }> {
  return [...css.matchAll(/^\s*(--cs-[a-z0-9-]+):\s*([^;]+);/gm)].map((match) => ({
    name: match[1] as string,
    value: (match[2] as string).trim(),
  }))
}

describe("the generated stylesheet", () => {
  it("is committed in the state the generator produces", () => {
    // The sheet is imported by every application. Regenerating on demand would
    // mean a stylesheet that is missing until someone remembers a command.
    expect(committed).toBe(generateVariablesCss())
  })

  it("declares every variable it references", () => {
    const declared = new Set(declarations(committed).map(({ name }) => name))
    const referenced = [...committed.matchAll(/var\((--cs-[a-z0-9-]+)\)/g)].map(
      (match) => match[1] as string,
    )

    const dangling = [...new Set(referenced)].filter((name) => !declared.has(name))

    expect(dangling).toEqual([])
  })

  it("never declares a variable in terms of itself", () => {
    // `--cs-x: var(--cs-x)` is invalid at computed-value time: the token stops
    // working silently, in every theme, with no error anywhere.
    const selfReferencing = declarations(committed)
      .filter(({ name, value }) => value.includes(`var(${name})`))
      .map(({ name }) => name)

    expect(selfReferencing).toEqual([])
  })

  it("rebinds only colour semantics when the mode changes", () => {
    const darkBlock = committed.slice(
      committed.indexOf('[data-theme="dark"] {'),
      committed.indexOf("}", committed.indexOf('[data-theme="dark"] {')),
    )

    const rebound = declarations(darkBlock).map(({ name }) => name.replace(PREFIX, ""))

    expect(rebound.sort()).toEqual([...COLOR_SEMANTICS].sort())
  })

  it("collapses every duration when the reader asks for reduced motion", () => {
    const query = committed.slice(committed.indexOf("@media (prefers-reduced-motion: reduce)"))

    expect(query).toContain(`${PREFIX}duration-fast: 0ms;`)
    expect(query).toContain(`${PREFIX}duration-normal: 0ms;`)
    expect(query).toContain(`${PREFIX}duration-slow: 0ms;`)
  })

  it("orders the cascade so high contrast wins over the mode it refines", () => {
    const dark = committed.indexOf('[data-theme="dark"] {')
    const lightHigh = committed.indexOf('[data-theme="light"][data-contrast="high"]')
    const darkHigh = committed.indexOf('[data-theme="dark"][data-contrast="high"]')

    expect(dark).toBeGreaterThan(-1)
    expect(lightHigh).toBeGreaterThan(dark)
    expect(darkHigh).toBeGreaterThan(lightHigh)
  })
})
