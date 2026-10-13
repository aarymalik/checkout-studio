#!/usr/bin/env node
/**
 * Adopts the screenshots this platform had never drawn, and nothing else.
 *
 * ## Why the visual job used to fail on every new case
 *
 * Baselines are per platform, because text rasterises differently on macOS and
 * on Linux. Nobody developing on a Mac can draw the Linux half, so every new
 * visual case arrived with half its baselines missing — and Playwright writes
 * a missing baseline and fails, deliberately, because a new baseline is a
 * change somebody should see.
 *
 * The result was a red X on every pull request that added a case, four times
 * in three days, each one meaning nothing. `pnpm visual:accept` made fixing it
 * one command; it did not stop it happening.
 *
 * ## A missing baseline is not a regression
 *
 * It is a picture of something that has never been photographed here. There is
 * nothing to compare it against, so there is nothing it can contradict.
 *
 * A *changed* baseline is the opposite: something that was photographed, and
 * now looks different. That is the entire point of the suite and it still
 * fails the build.
 *
 * Git tells the two apart exactly, without parsing anybody's log:
 *
 * - Playwright writes a **missing** baseline into the screenshots directory,
 *   so it appears as an untracked file.
 * - For a **changed** one it does not touch the baseline at all; it writes the
 *   actual into `test-results/`. The tracked file stays as it was.
 *
 * So: untracked screenshots and nothing else modified means the job's only
 * complaint was that it had never drawn these. They are committed and the job
 * passes. Anything else is a real difference and the job fails with it.
 */
import { execFileSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const BASELINES = "apps/studio/visual/__screenshots__"

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim()
}

/** `XY path` for everything git sees under the screenshots directory. */
const changes = git("status", "--porcelain", "--", BASELINES)
  .split("\n")
  .filter((line) => line.trim() !== "")
  /*
   * Two columns of status, then the path. Sliced at 2 and trimmed rather than
   * at 3, because a staged change and an unstaged one put their letter in
   * different columns and the first version ate a character off every path.
   */
  .map((line) => ({ status: line.slice(0, 2), path: line.slice(2).trim() }))

const untracked = changes.filter((change) => change.status === "??")
const other = changes.filter((change) => change.status !== "??")

if (other.length > 0) {
  console.error("The visual job failed on screenshots that already existed:\n")
  for (const change of other) console.error(`  ${change.status} ${change.path}`)
  console.error("\nThat is a difference, not a missing baseline. Read the run's artifact.")
  process.exit(1)
}

if (untracked.length === 0) {
  console.error("The visual job failed and drew no new screenshots, so it failed on something")
  console.error("else. Read its log.")
  process.exit(1)
}

console.log(`Adopting ${String(untracked.length)} screenshot(s) this platform had not drawn:\n`)
for (const change of untracked) console.log(`  ${change.path}`)

git("add", "--", BASELINES)

/*
 * Attributed to the run, not to a person. Whoever reads this later should be
 * able to find the job that drew them without guessing.
 */
const run = process.env["GITHUB_RUN_ID"] ?? "a local run"

git("-c", "user.name=github-actions[bot]", "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com", "commit", "-m", `test(studio): baselines this platform had not drawn\n\nWritten by the visual job in run ${run}. A missing baseline is a picture of\nsomething never photographed here, not a regression — see\nscripts/adopt-new-baselines.mjs.`)

console.log("\nCommitted. Push them with the branch.")
