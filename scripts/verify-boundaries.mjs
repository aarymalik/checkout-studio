#!/usr/bin/env node
/**
 * Verifies that the declared dependencies of every workspace package obey the
 * layer model, before a single import is written.
 *
 * ESLint catches a forbidden import. dependency-cruiser catches a forbidden
 * edge in the resolved graph. This catches a forbidden edge in package.json,
 * which is where it usually starts.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createRequire } from "node:module"
import { cruise } from "dependency-cruiser"
import { allowedDependencies, reasonFor, SCOPE } from "@checkout-studio/config/layers"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")

function readManifests(directory, kind) {
  const base = join(ROOT, directory)
  if (!existsSync(base)) return []

  return readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const manifestPath = join(base, entry.name, "package.json")
      if (!existsSync(manifestPath)) return null
      return {
        name: entry.name,
        kind,
        manifest: JSON.parse(readFileSync(manifestPath, "utf8")),
        path: `${directory}/${entry.name}/package.json`,
      }
    })
    .filter(Boolean)
}

const targets = [
  ...readManifests("packages", "package"),
  ...readManifests("plugins", "plugin"),
  ...readManifests("apps", "app"),
]

const violations = []

for (const target of targets) {
  const allowed = new Set(allowedDependencies(target.name, { kind: target.kind }))
  const declared = Object.keys({
    ...target.manifest.dependencies,
    ...target.manifest.peerDependencies,
  }).filter((name) => name.startsWith(`${SCOPE}/`))

  for (const dependency of declared) {
    const bare = dependency.slice(SCOPE.length + 1)
    if (bare === "config") continue
    if (!allowed.has(bare)) {
      violations.push(
        `${target.path}\n    ${target.name} declares ${dependency}\n    ${reasonFor(target.name, bare, { kind: target.kind })}`,
      )
    }
  }
}

if (violations.length > 0) {
  console.error(`\nLayer violations (${violations.length}):\n`)
  for (const violation of violations) console.error(`  ${violation}\n`)
  console.error("See docs/monorepo-structure.md.\n")
  process.exit(1)
}

console.log(`Declared dependencies verified: ${targets.length} workspaces, no layer violations.`)

/**
 * Second pass: the resolved import graph.
 *
 * package.json says what a package intends to depend on. This says what it
 * actually imports, and catches cycles that no single manifest reveals.
 */
const require = createRequire(import.meta.url)
const { forbidden, options } = require(join(ROOT, ".dependency-cruiser.cjs"))

// Only cruise directories that exist. Git does not track empty directories, so
// plugins/ is absent from a fresh checkout until the first plugin is created.
const targetDirs = ["packages", "apps", "plugins"]
  .map((dir) => join(ROOT, dir))
  .filter((dir) => existsSync(dir))

const graph = await cruise(targetDirs, { ...options, ruleSet: { forbidden }, validate: true })
const summary = graph.output.summary

if (summary.error > 0) {
  console.error(`\nGraph violations (${summary.error}):\n`)
  for (const violation of summary.violations.filter((v) => v.rule.severity === "error")) {
    console.error(`  ${violation.rule.name}: ${violation.from} → ${violation.to}`)
  }
  console.error("\nSee docs/monorepo-structure.md.\n")
  process.exit(1)
}

console.log(
  `Import graph verified: ${summary.totalCruised} modules, no cycles, no forbidden edges` +
    (summary.warn > 0 ? ` (${summary.warn} warnings)` : ""),
)
