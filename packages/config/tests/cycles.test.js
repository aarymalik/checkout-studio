import { describe, expect, it, beforeAll, afterAll } from "vitest"
import { cruise } from "dependency-cruiser"
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

/**
 * A cycle must fail the graph check. Proven against a real cycle rather than
 * trusting the configuration to be correct.
 */
let fixture

beforeAll(() => {
  fixture = mkdtempSync(join(tmpdir(), "cs-cycle-"))
  mkdirSync(join(fixture, "src"), { recursive: true })
  writeFileSync(
    join(fixture, "src", "a.js"),
    `import { b } from "./b.js"\nexport const a = () => b()\n`,
  )
  writeFileSync(
    join(fixture, "src", "b.js"),
    `import { a } from "./a.js"\nexport const b = () => a()\n`,
  )
})

afterAll(() => {
  rmSync(fixture, { recursive: true, force: true })
})

const rules = {
  forbidden: [{ name: "no-circular", severity: "error", from: {}, to: { circular: true } }],
}

describe("cycle detection", () => {
  it("reports a circular dependency as an error", async () => {
    const result = await cruise([join(fixture, "src")], { ruleSet: rules, validate: true })

    const violations = result.output.summary.violations
    expect(violations.length).toBeGreaterThan(0)
    expect(violations.every((violation) => violation.rule.name === "no-circular")).toBe(true)
    expect(result.output.summary.error).toBeGreaterThan(0)
  })

  it("reports nothing for an acyclic graph", async () => {
    const acyclic = mkdtempSync(join(tmpdir(), "cs-acyclic-"))
    mkdirSync(join(acyclic, "src"), { recursive: true })
    writeFileSync(join(acyclic, "src", "a.js"), `export const a = () => 1\n`)
    writeFileSync(
      join(acyclic, "src", "b.js"),
      `import { a } from "./a.js"\nexport const b = () => a()\n`,
    )

    const result = await cruise([join(acyclic, "src")], { ruleSet: rules, validate: true })

    expect(result.output.summary.violations).toHaveLength(0)
    rmSync(acyclic, { recursive: true, force: true })
  })
})
