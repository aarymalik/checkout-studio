#!/usr/bin/env node
/**
 * The published checkout's JavaScript budget.
 *
 * The exit criterion in docs/phases.md: the `[domain]/[slug]` route serves under
 * 150 KB of first-party JavaScript, gzipped — first-party meaning everything
 * from our origin, the React and Next.js runtime included.
 *
 * Measured from the build output rather than estimated, because the number that
 * matters is the one a visitor downloads. Run after `next build`.
 *
 * Two figures are reported and only one is enforced. The module scripts are what
 * a browser actually fetches. The polyfill bundle is emitted with `nomodule`, so
 * no browser that supports modules ever requests it — counting it would hold the
 * budget against bytes nobody receives. It is printed anyway, because a silent
 * exclusion is the kind of thing that quietly grows.
 *
 * What this catches, and the layer model cannot: a *transitive* import that
 * drags a server-only dependency into the client bundle. The first run of this
 * found 93 KB of zod in every customer's browser, reached from a client-side
 * error boundary through the utils barrel, which re-exports Stripe key
 * validators that build schemas at module scope.
 */
import { gzipSync } from "node:zlib"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const BUILD = join(ROOT, "apps", "renderer", ".next")
const ROUTE = "/[domain]/[slug]/page"

/** Per docs/phases.md, Phase 6. */
const BUDGET_BYTES = 150 * 1024

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!existsSync(BUILD)) {
  fail("No build to measure. Run `pnpm --filter @checkout-studio/renderer-app build` first.")
}

const routeManifest = join(
  BUILD,
  "server",
  "app",
  "[domain]",
  "[slug]",
  "page",
  "build-manifest.json",
)
const clientManifest = join(
  BUILD,
  "server",
  "app",
  "[domain]",
  "[slug]",
  "page_client-reference-manifest.js",
)

for (const path of [routeManifest, clientManifest]) {
  if (!existsSync(path)) fail(`The build is missing ${path}. Has the route moved?`)
}

const route = JSON.parse(readFileSync(routeManifest, "utf8"))

/**
 * The client chunks this route's client components live in.
 *
 * Read from the reference manifest, which Next writes as an assignment into a
 * global. Evaluating it is how Next itself reads it.
 */
function clientChunks() {
  globalThis.__RSC_MANIFEST = {}
  // eslint-disable-next-line no-eval -- the manifest is a generated assignment, and this is how Next reads it
  eval(readFileSync(clientManifest, "utf8"))

  const manifest = globalThis.__RSC_MANIFEST[ROUTE]

  if (manifest === undefined) fail(`The reference manifest has no entry for ${ROUTE}.`)

  const chunks = new Set()

  for (const entry of Object.values(manifest.clientModules ?? {})) {
    for (const chunk of entry.chunks ?? []) chunks.add(chunk.replace(/^\/_next\//, ""))
  }

  return chunks
}

const files = new Set([...(route.rootMainFiles ?? []), ...clientChunks()])
const scripts = [...files].filter((file) => file.endsWith(".js")).sort()

if (scripts.length === 0) fail("Measured no scripts at all. The manifest format has changed.")

let total = 0
const rows = []

for (const file of scripts) {
  const size = gzipSync(readFileSync(join(BUILD, file)), { level: 9 }).length

  total += size
  rows.push([size, file])
}

const polyfills = (route.polyfillFiles ?? []).reduce(
  (sum, file) => sum + gzipSync(readFileSync(join(BUILD, file)), { level: 9 }).length,
  0,
)

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`

for (const [size, file] of rows.sort((left, right) => right[0] - left[0])) {
  console.log(`  ${kb(size).padStart(9)}  ${file}`)
}

console.log(`  ${"—".repeat(9)}`)
console.log(`  ${kb(total).padStart(9)}  module scripts, gzipped`)
console.log(`  ${kb(polyfills).padStart(9)}  polyfills (nomodule — not served to a modern browser)`)

if (total > BUDGET_BYTES) {
  fail(
    `\nOver budget: ${kb(total)} of first-party JavaScript, against ${kb(BUDGET_BYTES)}.\n` +
      "A published checkout ships no editor code. Check what a client component imports\n" +
      "transitively — a barrel that re-exports server-only modules is the usual cause.\n" +
      "See docs/phases.md, Phase 6 exit criteria.",
  )
}

console.log(
  `\nWithin budget: ${kb(total)} of ${kb(BUDGET_BYTES)} (${Math.round((total / BUDGET_BYTES) * 100)}%).`,
)
