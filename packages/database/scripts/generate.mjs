/**
 * Generates the Prisma client.
 *
 * Generation reads the schema and never opens a connection, but
 * prisma.config.ts requires DATABASE_URL because migrations genuinely need
 * it. Requiring it here too would mean a fresh clone could not install,
 * typecheck or run a unit test until someone had a database — so this one
 * command, and only this one, supplies a placeholder when nothing is set.
 * Anything that does connect still fails loudly on a missing URL.
 */
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"

const prismaCli = createRequire(import.meta.url).resolve("prisma/build/index.js")

const result = spawnSync(process.execPath, [prismaCli, "generate"], {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: process.env["DATABASE_URL"] ?? "postgresql://client-generation-only",
  },
})

process.exit(result.status ?? 1)
