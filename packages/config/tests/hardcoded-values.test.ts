import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { findHardcodedValues } from "../../../scripts/check-hardcoded-values.mjs"

/**
 * The design system is only worth having if nothing bypasses it, so the
 * checker is tested against source it is given rather than against the
 * repository — which today contains nothing to find, and would let a broken
 * rule pass for months.
 */
let root: string

function source(name: string, contents: string): void {
  writeFileSync(join(root, "src", name), contents)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cs-tokens-"))
  mkdirSync(join(root, "src"), { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

async function findings(): Promise<Array<{ rule: string; value: string }>> {
  return (await findHardcodedValues(["src"], root)) as Array<{ rule: string; value: string }>
}

describe("the hardcoded value checker", () => {
  it("passes source built from tokens", async () => {
    source(
      "Button.tsx",
      `export const Button = () => <button className="bg-primary text-primary-foreground rounded-control duration-fast" />`,
    )

    expect(await findings()).toEqual([])
  })

  it("catches a hex colour", async () => {
    source("Card.tsx", `const styles = { color: "#0a0a0b" }`)

    const found = await findings()
    expect(found).toHaveLength(1)
    expect(found[0]?.rule).toBe("colour")
  })

  it("catches colour functions, including the modern ones", async () => {
    source("a.tsx", `const a = "rgb(0 0 0)"`)
    source("b.tsx", `const b = "oklch(0.7 0.1 250)"`)
    source("c.tsx", `const c = "hsla(0, 0%, 0%, 0.5)"`)

    expect((await findings()).map((finding) => finding.rule)).toEqual([
      "colour",
      "colour",
      "colour",
    ])
  })

  it("catches a raw pixel value", async () => {
    source("Panel.tsx", `const width = "320px"`)

    expect((await findings())[0]?.rule).toBe("length")
  })

  it("catches a duration outside the motion tokens", async () => {
    source("Toast.tsx", `const timing = "300ms"`)

    expect((await findings())[0]?.rule).toBe("duration")
  })

  it("catches a Tailwind arbitrary value reaching past the scale", async () => {
    source("Dialog.tsx", `<div className="p-[13px]" />`)

    expect((await findings()).some((finding) => finding.rule === "arbitrary utility")).toBe(true)
  })

  it("checks stylesheets too, not only components", async () => {
    source("panel.css", `.panel { border-radius: 18px; }`)

    expect((await findings())[0]?.rule).toBe("length")
  })

  it("catches spacing that is off the 8px system", async () => {
    // "Never use arbitrary spacing" is easy to agree with and easy to drift
    // from: a 6px gap looks right on its own and wrong beside everything else.
    source("Row.tsx", `<div className="flex gap-1.5 px-2.5" />`)

    const found = await findings()
    expect(found[0]?.rule).toBe("spacing step")
    expect(found[0]?.value).toBe("gap-1.5")
  })

  it("accepts every step that is on the scale", async () => {
    source(
      "Grid.tsx",
      `<div className="p-0 m-1 gap-2 pt-3 px-4 py-6 mb-8 ml-10 mr-12 pl-16 pr-20 mt-24" />`,
    )

    expect(await findings()).toEqual([])
  })

  it("leaves dimensions and transforms alone, which are not page rhythm", async () => {
    // Centring a 16px thumb in a 20px track takes 2px, and no rounding of that
    // is correct. A control's height answers to the design, not to the scale.
    source("Switch.tsx", `<span className="h-5 w-9 size-4 translate-x-0.5" />`)

    expect(await findings()).toEqual([])
  })

  it("does not flag a comment that explains a value", async () => {
    source("Box.tsx", `// At 16px square, 12px of rounding is a circle.\nconst a = 1`)

    expect(await findings()).toEqual([])
  })

  it("lets a value through when the line says why it cannot be a token", async () => {
    source(
      "Canvas.tsx",
      `const hairline = "1px" // design-system-ignore: a canvas hairline is a device pixel, not a spacing step`,
    )

    expect(await findings()).toEqual([])
  })

  it("ignores tests, which may assert on literal values", async () => {
    writeFileSync(join(root, "src", "Button.test.tsx"), `expect(style.color).toBe("#ffffff")`)

    expect(await findings()).toEqual([])
  })

  it("reports where the value is, so it can be fixed without a search", async () => {
    source("Deep.tsx", `const a = 1\nconst b = 2\nconst c = "#fff"`)

    const found = (await findHardcodedValues(["src"], root)) as Array<{
      file: string
      line: number
    }>

    expect(found[0]?.file).toBe("src/Deep.tsx")
    expect(found[0]?.line).toBe(3)
  })
})
