#!/usr/bin/env node
/**
 * The renderer's boundaries, checked at the source level.
 *
 * The layer model already forbids the renderer from importing the editor, the
 * Studio UI, the design system, the database, or the API — `verify-boundaries`
 * catches a declared dependency and dependency-cruiser catches a resolved edge.
 * This checks the three things neither of them can see:
 *
 *   1. No `eval` and no `Function` constructor anywhere in the package. The
 *      promise is that schema content is never executed, and the strongest form
 *      of that promise is that the capability is absent rather than unused.
 *   2. Raw HTML is written in exactly one place, and it carries CSS. Every other
 *      `dangerouslySetInnerHTML` would be schema content reaching the DOM
 *      unparsed.
 *   3. No literal colour or pixel value in the source. The renderer emits CSS
 *      from a theme; a hex code in a component means a value the theme cannot
 *      reach, which is the whole point of the token system.
 *
 * Runs on the source, not on node_modules: this is about what we wrote.
 */
import { readFileSync, readdirSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const PACKAGE = join(ROOT, "packages", "renderer")
const SOURCE = join(PACKAGE, "src")

/** The one file allowed to write raw HTML, and it writes the stylesheet. */
const STYLESHEET_WRITER = join("runtime", "CheckoutRenderer.tsx")

/**
 * Where literal values are the point rather than a mistake.
 *
 * The breakpoints are the device frames from docs/phases.md, and a media query
 * cannot be written in terms of a token — a custom property is not permitted in
 * a media feature.
 */
const LITERALS_ALLOWED = [join("styles", "breakpoints.ts")]

const FORBIDDEN_CODE = [
  { pattern: /\beval\s*\(/, reason: "the renderer never evaluates schema content" },
  { pattern: /\bnew\s+Function\s*\(/, reason: "the renderer never compiles schema content" },
  { pattern: /\bFunction\s*\(\s*["'`]/, reason: "the renderer never compiles schema content" },
]

/** A colour or a pixel value written out rather than taken from the theme. */
const LITERAL_VALUE = [
  { pattern: /#[0-9a-fA-F]{3,8}\b/, reason: "a literal colour" },
  { pattern: /\b\d+px\b/, reason: "a literal pixel value" },
]

function sources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) return sources(path)

    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

/** Strips comments, so a hex code in an explanation is not a violation. */
function code(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

const problems = []
const files = sources(SOURCE)
const htmlWriters = []

for (const file of files) {
  const where = relative(SOURCE, file)
  const source = readFileSync(file, "utf8")
  const stripped = code(source)

  for (const { pattern, reason } of FORBIDDEN_CODE) {
    if (pattern.test(stripped)) {
      problems.push(`${where}: ${pattern.source} — ${reason}.`)
    }
  }

  if (stripped.includes("dangerouslySetInnerHTML")) htmlWriters.push(where)

  if (LITERALS_ALLOWED.includes(where)) continue

  for (const { pattern, reason } of LITERAL_VALUE) {
    const match = pattern.exec(stripped)

    if (match !== null) {
      problems.push(
        `${where}: ${reason} (${match[0]}). The renderer emits values from the theme; nothing here holds one.`,
      )
    }
  }
}

if (htmlWriters.length !== 1 || htmlWriters[0] !== STYLESHEET_WRITER) {
  problems.push(
    `dangerouslySetInnerHTML must appear only in ${STYLESHEET_WRITER}, and only for the stylesheet. Found in: ${htmlWriters.join(", ") || "nowhere"}.`,
  )
}

if (problems.length > 0) {
  console.error(`The renderer's boundaries were crossed in ${problems.length} place(s):\n`)
  for (const problem of problems) console.error(`  ${problem}`)
  console.error("\nSee docs/renderer.md § Security and docs/theme-system.md.")
  process.exit(1)
}

console.log(`Renderer boundaries verified: ${files.length} files, no forbidden code, no literals.`)
