#!/usr/bin/env node
/**
 * Creates a workspace package wired to the layer model.
 *
 * Usage:
 *   node scripts/create-package.ts <name> --deps schema,utils [--react] [--external zod@4.6.5]
 *
 * The generated package is immediately lintable, typecheckable and testable.
 * Dependencies are validated against docs/monorepo-structure.md, so a package
 * cannot be created with an import its layer forbids.
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { allowedDependencies, layerOf, reasonFor, SCOPE } from "@checkout-studio/config/layers"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")

export interface CreatePackageOptions {
  /** Bare package name, e.g. "schema". */
  name: string
  /** Workspace packages this one may import, by bare name. */
  deps: string[]
  /** External npm dependencies, as "name@version". */
  external: string[]
  /** React library: adds the React peer dependency and the JSX preset. */
  react: boolean
  /** "package" lives in packages/, "plugin" lives in plugins/. */
  kind: "package" | "plugin"
  /** One sentence. Becomes the README's first line. */
  description: string
  /** What this package deliberately does not do. */
  excludes: string
  /** Workspace root. Defaults to this repository; overridden in tests. */
  root?: string
}

export function renderPackageJson(options: CreatePackageOptions): string {
  const dependencies: Record<string, string> = {}
  for (const dep of [...options.deps].sort()) {
    dependencies[`${SCOPE}/${dep}`] = "workspace:*"
  }
  for (const spec of [...options.external].sort()) {
    const at = spec.lastIndexOf("@")
    dependencies[spec.slice(0, at)] = spec.slice(at + 1)
  }

  const manifest: Record<string, unknown> = {
    name: `${SCOPE}/${options.name}`,
    version: "0.0.0",
    private: true,
    license: "UNLICENSED",
    type: "module",
    exports: { ".": "./src/index.ts" },
    scripts: {
      lint: "eslint .",
      typecheck: "tsc --noEmit -p tsconfig.json",
      test: "vitest run",
      "test:coverage": "vitest run --coverage",
      clean: "rm -rf coverage .turbo",
    },
    ...(Object.keys(dependencies).length > 0 ? { dependencies } : {}),
    devDependencies: {
      [`${SCOPE}/config`]: "workspace:*",
      eslint: "10.11.0",
      typescript: "5.9.3",
      vitest: "5.0.1",
      "@vitest/coverage-v8": "5.0.1",
      // React packages test in a DOM environment.
      ...(options.react ? { jsdom: "30.1.1" } : {}),
    },
    ...(options.react ? { peerDependencies: { react: "^19.0.0", "react-dom": "^19.0.0" } } : {}),
  }

  return `${JSON.stringify(manifest, null, 2)}\n`
}

export function renderTsconfig(options: CreatePackageOptions): string {
  const preset = options.react ? "react-library" : "base"
  return `${JSON.stringify(
    {
      extends: `${SCOPE}/config/typescript/${preset}.json`,
      include: ["src/**/*", "tests/**/*", "*.config.ts"],
    },
    null,
    2,
  )}\n`
}

export function renderEslintConfig(options: CreatePackageOptions): string {
  const preset = options.react ? "react" : "base"
  const importName = options.react ? "reactConfig" : "baseConfig"
  const kindArg = options.kind === "plugin" ? `, { kind: "plugin" }` : ""

  return `import { ${importName} } from "${SCOPE}/config/eslint/${preset}"
import { boundariesConfig } from "${SCOPE}/config/eslint/boundaries"

export default [...${importName}, boundariesConfig("${options.name}"${kindArg})]
`
}

export function renderVitestConfig(options: CreatePackageOptions): string {
  const environment = options.react ? "jsdom" : "node"
  return `import { createVitestConfig } from "${SCOPE}/config/vitest/base"

export default createVitestConfig({ environment: "${environment}" })
`
}

export function renderReadme(options: CreatePackageOptions): string {
  const layer = options.kind === "plugin" ? 5 : layerOf(options.name)
  const allowed = allowedDependencies(options.name, { kind: options.kind })

  return `# ${SCOPE}/${options.name}

${options.description}

**Layer ${layer}.** May depend on: ${allowed.length > 0 ? allowed.join(", ") : "nothing"}.

Does not contain: ${options.excludes}

See [docs/monorepo-structure.md](../../docs/monorepo-structure.md).
`
}

export function validateDeps(options: CreatePackageOptions): void {
  const allowed = new Set(allowedDependencies(options.name, { kind: options.kind }))
  for (const dep of options.deps) {
    if (!allowed.has(dep)) {
      throw new Error(
        `${options.name} may not depend on ${dep}. ${reasonFor(options.name, dep, { kind: options.kind })}`,
      )
    }
  }
}

export function createPackage(options: CreatePackageOptions): string {
  validateDeps(options)

  const root = options.root ?? ROOT
  const dir = join(root, options.kind === "plugin" ? "plugins" : "packages", options.name)
  if (existsSync(dir)) {
    throw new Error(`${dir} already exists`)
  }

  mkdirSync(join(dir, "src"), { recursive: true })
  writeFileSync(join(dir, "package.json"), renderPackageJson(options))
  writeFileSync(join(dir, "tsconfig.json"), renderTsconfig(options))
  writeFileSync(join(dir, "eslint.config.js"), renderEslintConfig(options))
  writeFileSync(join(dir, "vitest.config.ts"), renderVitestConfig(options))
  writeFileSync(join(dir, "README.md"), renderReadme(options))

  return dir
}

function parseArgs(argv: string[]): CreatePackageOptions {
  const [name] = argv
  if (!name || name.startsWith("-")) {
    throw new Error("Usage: node scripts/create-package.ts <name> [--deps a,b] [--react]")
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
    deps: list("deps"),
    external: list("external"),
    react: argv.includes("--react"),
    kind: argv.includes("--plugin") ? "plugin" : "package",
    description:
      flag("description") ?? "One sentence describing this package's single responsibility.",
    excludes: flag("excludes") ?? "anything outside that responsibility.",
  }
}

const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  const dir = createPackage(parseArgs(process.argv.slice(2)))
  console.log(`Created ${dir}`)
  console.log("Next: add src/index.ts, then run pnpm install")
}
