#!/usr/bin/env node
/**
 * Creates a plugin package.
 *
 * Usage:
 *   node scripts/create-plugin.ts checkout --description "Payment Element, Order Summary…"
 *
 * Plugins are generated with split entry points so the renderer bundle never
 * receives editor-only code, per docs/monorepo-structure.md.
 */
import { writeFileSync, readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { createPackage, type CreatePackageOptions } from "./create-package.ts"
import { SCOPE } from "@checkout-studio/config/layers"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")

export function createPlugin(options: Omit<CreatePackageOptions, "kind">): string {
  const dir = createPackage({ ...options, kind: "plugin" })

  // Plugins expose three entry points: the manifest, the renderer half, and the
  // editor half. Splitting them is what makes the renderer bundle tree-shakeable.
  const manifestPath = join(dir, "package.json")
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>
  manifest["name"] = `${SCOPE}/plugin-${options.name}`
  manifest["exports"] = {
    ".": "./src/index.ts",
    "./renderer": "./src/renderer.ts",
    "./editor": "./src/editor.ts",
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  writeFileSync(join(dir, "src", "index.ts"), `export { manifest } from "./manifest"\n`)
  writeFileSync(
    join(dir, "src", "manifest.ts"),
    `import type { PluginManifest } from "${SCOPE}/plugin-sdk"

export const manifest: PluginManifest = {
  id: "${options.name}",
  name: "${options.name}",
  version: "0.0.0",
  components: [],
}
`,
  )
  writeFileSync(
    join(dir, "src", "renderer.ts"),
    `/** Renderer-side entry point: component definitions and their Renderer.tsx files only. */\nexport {}\n`,
  )
  writeFileSync(
    join(dir, "src", "editor.ts"),
    `/** Editor-side entry point: property definitions, icons and previews. */\nexport {}\n`,
  )

  return dir
}

function parseArgs(argv: string[]): Omit<CreatePackageOptions, "kind"> {
  const [name] = argv
  if (!name || name.startsWith("-")) {
    throw new Error("Usage: node scripts/create-plugin.ts <name> [--deps a,b] [--description ...]")
  }

  const flag = (key: string): string | undefined => {
    const index = argv.indexOf(`--${key}`)
    return index === -1 ? undefined : argv[index + 1]
  }
  const list = (key: string): string[] =>
    (flag(key) ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)

  return {
    name,
    deps: list("deps").length > 0 ? list("deps") : ["plugin-sdk", "schema"],
    external: list("external"),
    react: true,
    description: flag("description") ?? "A Checkout Studio plugin.",
    excludes: flag("excludes") ?? "editor internals and server code.",
  }
}

const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  const dir = createPlugin(parseArgs(process.argv.slice(2)))
  console.log(`Created ${dir.replace(ROOT, ".")}`)
}
