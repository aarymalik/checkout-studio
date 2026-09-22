#!/usr/bin/env node
/**
 * Links the workspace environment file into each application.
 *
 * Next reads .env.local from the application directory. This repository keeps
 * one copy at the root, per docs/contributing.md, so each app gets a symlink to
 * it. Runs on install; safe to run repeatedly; does nothing in CI, where the
 * environment comes from the platform rather than a file.
 */
import { existsSync, lstatSync, readdirSync, symlinkSync, unlinkSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const ENV_FILE = join(ROOT, ".env.local")

if (process.env.CI) {
  process.exit(0)
}

if (!existsSync(ENV_FILE)) {
  console.log(
    "No .env.local at the workspace root. Copy .env.example to .env.local to get started.",
  )
  process.exit(0)
}

const appsDir = join(ROOT, "apps")
if (!existsSync(appsDir)) process.exit(0)

for (const entry of readdirSync(appsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue

  const link = join(appsDir, entry.name, ".env.local")

  if (existsSync(link) || lstatSync(link, { throwIfNoEntry: false })) {
    const stat = lstatSync(link)
    if (!stat.isSymbolicLink()) {
      // A developer created a real file here deliberately. Leave it alone.
      continue
    }
    unlinkSync(link)
  }

  symlinkSync(join("..", "..", ".env.local"), link)
}

console.log("Linked .env.local into each application.")
