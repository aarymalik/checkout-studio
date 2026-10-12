#!/usr/bin/env node
/**
 * Brings CI's Linux screenshots back from the last failed visual run.
 *
 * ## Why this is a script and not a paragraph in a README
 *
 * Baselines are per platform — macOS and Linux rasterise text differently —
 * and nobody developing on a Mac can produce the Linux half. So a new visual
 * case always costs one CI round trip: the job writes what it drew, uploads
 * it, and fails.
 *
 * That part is structural. What was not structural was doing the other six
 * steps by hand every time: find the run, download the artifact, work out
 * which files are new, copy them to the right directory, look at them, commit.
 * It happened three times in two days, and the third time somebody asked why
 * it kept happening.
 *
 * This does the fetching and the copying. It deliberately does not commit:
 * the images are the baseline every future run is compared against, and one
 * nobody looked at is a test that passes for a reason nobody chose.
 *
 * Usage: pnpm visual:accept [branch]
 */
import { execFileSync } from "node:child_process"
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const BASELINES = join(ROOT, "apps", "studio", "visual", "__screenshots__", "linux")
const ARTIFACT = "visual-regression"

function gh(...args) {
  return execFileSync("gh", args, { cwd: ROOT, encoding: "utf8" }).trim()
}

function currentBranch() {
  return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim()
}

/** The newest run on this branch whose visual job failed. */
function lastFailedRun(branch) {
  const runs = JSON.parse(
    gh("run", "list", "--branch", branch, "--limit", "10", "--json", "databaseId,conclusion"),
  )

  return runs.find((run) => run.conclusion === "failure")?.databaseId ?? null
}

/**
 * Every screenshot in the artifact, by the name it is stored under.
 *
 * Two shapes, because the job fails in two ways. A baseline that does not
 * exist is written straight into `__screenshots__/linux`; one that exists and
 * differs is written to `test-results/<test>/<name>-actual.png`. Both are
 * what CI drew, and both are what should become the baseline once somebody
 * has looked at them.
 *
 * The first of those directories holds the whole set, not only what changed —
 * the job uploads the directory. So the comparison below is against the bytes
 * already committed, or this would report sixty files as changed and bury the
 * six that are.
 */
function screenshotsIn(directory) {
  const found = new Map()
  const linux = join(directory, "visual", "__screenshots__", "linux")

  if (existsSync(linux)) {
    for (const name of readdirSync(linux)) {
      if (name.endsWith(".png")) found.set(name, join(linux, name))
    }
  }

  const results = join(directory, "test-results")

  if (existsSync(results)) {
    for (const entry of readdirSync(results)) {
      const path = join(results, entry)

      if (!statSync(path).isDirectory()) continue

      for (const name of readdirSync(path)) {
        if (!name.endsWith("-actual.png")) continue

        found.set(name.replace("-actual", ""), join(path, name))
      }
    }
  }

  return found
}

const branch = process.argv[2] ?? currentBranch()
const run = lastFailedRun(branch)

if (run === null) {
  console.error(`No failed run on ${branch}. Nothing to accept.`)
  process.exit(1)
}

const workspace = mkdtempSync(join(tmpdir(), "visual-"))

try {
  gh("run", "download", String(run), "-n", ARTIFACT, "-D", workspace)
} catch {
  console.error(`Run ${String(run)} has no ${ARTIFACT} artifact. Did the visual job run?`)
  rmSync(workspace, { recursive: true, force: true })
  process.exit(1)
}

const screenshots = screenshotsIn(workspace)
const written = []

for (const [name, source] of screenshots) {
  const target = join(BASELINES, name)
  const drawn = readFileSync(source)

  if (existsSync(target) && readFileSync(target).equals(drawn)) continue

  written.push(`${existsSync(target) ? "changed" : "new"}      ${name}`)
  cpSync(source, target)
}

rmSync(workspace, { recursive: true, force: true })

if (written.length === 0) {
  console.error(
    `Run ${String(run)} drew nothing this branch does not already have. Read its log instead.`,
  )
  process.exit(1)
}

console.log(`From run ${String(run)} on ${branch}:\n`)
for (const line of written.sort()) console.log(`  ${line}`)
console.log(`\nLook at them before committing. They are what every later run is compared against.`)
