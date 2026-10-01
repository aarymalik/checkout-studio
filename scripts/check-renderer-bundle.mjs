#!/usr/bin/env node
/**
 * The published checkout's JavaScript budget.
 *
 * Measured from the build output rather than estimated, because the number that
 * matters is the one a visitor downloads. Run after `next build`.
 *
 * Two budgets, because the bytes have two owners and only one of them is us.
 *
 * **First-party** is our own code: the renderer's client modules and whatever
 * the components registered by plugins drag in. This is the gate. It is the
 * number that grows as the product grows, and the number a careless import
 * blows up — the first run of this check found 93 KB of zod in every customer's
 * browser, reached from a client-side error boundary through a barrel that
 * re-exports Stripe key validators.
 *
 * **The framework floor** is React DOM and Next's App Router client runtime.
 * It is a tripwire rather than a target: nothing we write moves it, and the
 * ceiling exists so that a framework upgrade which adds 40 KB to every checkout
 * is something we find out about here rather than in a Lighthouse report.
 *
 * Why the floor is not simply removed — it was tried, and the alternatives cost
 * more than they save:
 *
 *   - A Route Handler returning the HTML itself ships zero JavaScript, but
 *     React's server layer has neither `Component` nor `createContext`, so it
 *     cannot host error boundaries or context providers. Per-node error
 *     isolation is a Phase 6 guarantee: a broken component must never break a
 *     page. That is what the 45 KB of React DOM in this floor buys.
 *   - The Pages Router keeps both and sheds the App Router's ~80 KB, but its
 *     page module graph is shared with the client, so `server-only` no longer
 *     protects the database. Not a trade to make on a payments application.
 *
 * Recorded in docs/phases.md under Phase 6, As Built.
 */
import { gzipSync } from "node:zlib"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const BUILD = join(ROOT, "apps", "renderer", ".next")
const ROUTE = "/[domain]/[slug]/page"

/**
 * What we are allowed to add on top of the floor.
 *
 * Twenty times the renderer's current client code, which is generous for a
 * component library, a form system and a payment element — and far short of
 * unlimited. With the floor, a page at this ceiling is still inside a sub-two
 * second LCP on a 4G connection, which is the figure docs/performance.md cares
 * about. Worth revisiting once Phases 9 to 11 have real components in it.
 */
const FIRST_PARTY_BUDGET = 60 * 1024

/**
 * A tripwire on React DOM and the App Router, not a target.
 *
 * Set at the figure docs/phases.md originally gave the whole page, which is
 * where that number belongs: it turned out to describe the framework rather
 * than anything we write. Measured at 126.8 KB, so there is room for a minor
 * upgrade to move without failing a build for a reason nobody chose — and not
 * so much room that a large one passes unnoticed.
 */
const FRAMEWORK_CEILING = 150 * 1024

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

/** Our own modules live in the workspace; the framework's live in node_modules. */
function isFirstParty(moduleId) {
  return !moduleId.includes("node_modules")
}

/**
 * The route's client chunks, split by who put the code in them.
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

  const ours = new Set()
  const theirs = new Set()

  for (const [moduleId, entry] of Object.entries(manifest.clientModules ?? {})) {
    const target = isFirstParty(moduleId) ? ours : theirs

    for (const chunk of entry.chunks ?? []) target.add(chunk.replace(/^\/_next\//, ""))
  }

  return { ours, theirs }
}

const { ours, theirs } = clientChunks()

// Everything the document loads regardless of what the page contains.
for (const file of route.rootMainFiles ?? []) theirs.add(file)

/**
 * A chunk holding both is counted as ours.
 *
 * It should not happen — Turbopack has kept our four client modules in a chunk
 * of their own — and if it starts happening, the strict attribution means the
 * gate tightens and says so rather than quietly mislaying our bytes in the
 * floor.
 */
const mixed = [...ours].filter((chunk) => theirs.has(chunk))

function weigh(chunks) {
  const rows = []
  let total = 0

  for (const file of [...chunks].filter((file) => file.endsWith(".js")).sort()) {
    const size = gzipSync(readFileSync(join(BUILD, file)), { level: 9 }).length

    total += size
    rows.push([size, file])
  }

  return { rows, total }
}

const firstParty = weigh(ours)
const framework = weigh([...theirs].filter((chunk) => !ours.has(chunk)))

if (firstParty.rows.length + framework.rows.length === 0) {
  fail("Measured no scripts at all. The manifest format has changed.")
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`

function report(label, { rows, total }, budget) {
  console.log(`\n${label} — ${kb(total)} of ${kb(budget)}`)

  for (const [size, file] of rows.sort((left, right) => right[0] - left[0])) {
    console.log(`  ${kb(size).padStart(9)}  ${file}`)
  }
}

report("First-party", firstParty, FIRST_PARTY_BUDGET)
report("Framework floor", framework, FRAMEWORK_CEILING)

const polyfills = (route.polyfillFiles ?? []).reduce(
  (sum, file) => sum + gzipSync(readFileSync(join(BUILD, file)), { level: 9 }).length,
  0,
)

// Emitted with `nomodule`, so no browser that supports modules ever requests
// it. Printed rather than counted, because a silent exclusion is the kind of
// thing that quietly grows.
console.log(
  `\n  ${kb(polyfills).padStart(9)}  polyfills (nomodule — not served to a modern browser)`,
)

if (mixed.length > 0) {
  console.log(`\nChunks holding both ours and the framework's code: ${mixed.join(", ")}`)
}

if (firstParty.total > FIRST_PARTY_BUDGET) {
  fail(
    `\nOver budget: ${kb(firstParty.total)} of first-party JavaScript, against ${kb(FIRST_PARTY_BUDGET)}.\n` +
      "A published checkout ships no editor code. Check what a client component imports\n" +
      "transitively — a barrel that re-exports server-only modules is the usual cause.\n" +
      "See docs/phases.md, Phase 6 exit criteria.",
  )
}

if (framework.total > FRAMEWORK_CEILING) {
  fail(
    `\nThe framework floor has grown to ${kb(framework.total)}, past the ${kb(FRAMEWORK_CEILING)} tripwire.\n` +
      "Nothing we wrote moves this number, so a framework upgrade is the likely cause.\n" +
      "Decide deliberately whether to accept it: it is paid by every customer on every\n" +
      "checkout. See the note in this script for what the floor buys and why it is not\n" +
      "simply removed.",
  )
}

console.log(
  `\nWithin budget. First-party ${Math.round((firstParty.total / FIRST_PARTY_BUDGET) * 100)}% of its budget; floor ${Math.round((framework.total / FRAMEWORK_CEILING) * 100)}% of its tripwire.`,
)
