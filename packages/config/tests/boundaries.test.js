import { describe, expect, it } from "vitest"
import { ESLint } from "eslint"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")

/**
 * The boundary rules are only worth having if a violation actually fails lint.
 * These tests lint real source text against a real package's configuration.
 */
async function lintAs(packageDir, source) {
  const cwd = join(ROOT, packageDir)
  const eslint = new ESLint({
    cwd,
    overrideConfigFile: join(cwd, "eslint.config.js"),
    errorOnUnmatchedPattern: false,
  })
  const [result] = await eslint.lintText(source, {
    filePath: join(cwd, "src", "boundary-probe.ts"),
  })
  return result?.messages ?? []
}

describe("layer enforcement in ESLint", () => {
  it("fails when the renderer imports the editor, and says why", async () => {
    const messages = await lintAs(
      "packages/renderer",
      `import { createEditorStore } from "@checkout-studio/editor"\nexport const store = createEditorStore\n`,
    )
    const violation = messages.find((message) => message.ruleId === "no-restricted-imports")

    expect(violation).toBeDefined()
    expect(violation.severity).toBe(2)
    expect(violation.message).toContain("renderer may not import @checkout-studio/editor")
    expect(violation.message).toContain("never depend on builder code")
  })

  it("fails when the renderer imports Studio UI", async () => {
    const messages = await lintAs("packages/renderer", `import "@checkout-studio/ui"\n`)

    expect(messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(true)
  })

  it("fails when the editor imports server code", async () => {
    const messages = await lintAs("packages/editor", `import "@checkout-studio/database"\n`)
    const violation = messages.find((m) => m.ruleId === "no-restricted-imports")

    expect(violation).toBeDefined()
    expect(violation.message).toContain("runs in the browser")
  })

  it("fails on a deep import that bypasses a package's public surface", async () => {
    const messages = await lintAs(
      "packages/editor",
      `import "@checkout-studio/schema/src/internal"\n`,
    )
    const violation = messages.find((m) => m.ruleId === "no-restricted-imports")

    expect(violation).toBeDefined()
    expect(violation.message).toContain("Import from the package root")
  })

  it("allows the editor to import the renderer, which is the one-way edge", async () => {
    const messages = await lintAs("packages/editor", `import "@checkout-studio/renderer"\n`)

    expect(messages.filter((m) => m.ruleId === "no-restricted-imports")).toHaveLength(0)
  })

  it("allows the renderer to import the schema", async () => {
    const messages = await lintAs("packages/renderer", `import "@checkout-studio/schema"\n`)

    expect(messages.filter((m) => m.ruleId === "no-restricted-imports")).toHaveLength(0)
  })
})
