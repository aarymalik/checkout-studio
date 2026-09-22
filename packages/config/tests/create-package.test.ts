import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { mkdtempSync, readFileSync, rmSync, existsSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createPackage, validateDeps } from "../../../scripts/create-package.ts"

/**
 * The generator is how every future package is created. If it can produce a
 * package that violates the layer model, the model is advisory.
 */
let root: string

const base = {
  external: [] as string[],
  react: false,
  kind: "package" as const,
  description: "A test package.",
  excludes: "nothing yet.",
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cs-gen-"))
  mkdirSync(join(root, "packages"), { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe("createPackage", () => {
  it("generates a complete, parseable package", () => {
    const dir = createPackage({ ...base, name: "renderer", deps: ["schema", "utils"], root })

    for (const file of [
      "package.json",
      "tsconfig.json",
      "eslint.config.js",
      "vitest.config.ts",
      "README.md",
    ]) {
      expect(existsSync(join(dir, file)), `${file} should exist`).toBe(true)
    }

    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
      name: string
      dependencies: Record<string, string>
      scripts: Record<string, string>
    }

    expect(manifest.name).toBe("@checkout-studio/renderer")
    expect(manifest.dependencies["@checkout-studio/schema"]).toBe("workspace:*")
    expect(manifest.scripts["typecheck"]).toBe("tsc --noEmit -p tsconfig.json")
  })

  it("wires the generated package to the shared presets, not its own copies", () => {
    const dir = createPackage({ ...base, name: "hooks", deps: ["utils"], root })

    expect(readFileSync(join(dir, "tsconfig.json"), "utf8")).toContain(
      "@checkout-studio/config/typescript/base.json",
    )
    expect(readFileSync(join(dir, "eslint.config.js"), "utf8")).toContain(
      'boundariesConfig("hooks")',
    )
  })

  it("uses the React presets for a React package", () => {
    const dir = createPackage({ ...base, name: "ui", deps: ["design-system"], react: true, root })

    expect(readFileSync(join(dir, "tsconfig.json"), "utf8")).toContain("react-library.json")
    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
      peerDependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
    expect(manifest.peerDependencies["react"]).toBe("^19.0.0")
    expect(manifest.devDependencies["jsdom"]).toBeDefined()
  })

  it("refuses to create a package that violates the layer model", () => {
    expect(() => createPackage({ ...base, name: "renderer", deps: ["editor"], root })).toThrow(
      /renderer may not depend on editor/,
    )
  })

  it("refuses a lateral dependency within a layer", () => {
    expect(() => validateDeps({ ...base, name: "api", deps: ["editor"], root })).toThrow(
      /same layer/,
    )
  })

  it("refuses to overwrite an existing package", () => {
    createPackage({ ...base, name: "types", deps: [], root })

    expect(() => createPackage({ ...base, name: "types", deps: [], root })).toThrow(
      /already exists/,
    )
  })
})
