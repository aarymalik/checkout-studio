import { existsSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"

/**
 * Conventional Commits, per docs/contributing.md.
 *
 * Package scopes are read from the workspace rather than listed, because a
 * hand-maintained list drifts: a new package arrives and the first commit
 * that touches it is rejected for naming it.
 */
const workspaceScopes = ["packages", "apps", "plugins"].flatMap((group) => {
  const directory = fileURLToPath(new URL(group, import.meta.url))
  if (!existsSync(directory)) return []

  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
})

/** Scopes that name a concern rather than a directory. */
const crossCuttingScopes = ["checkout", "stripe", "auth", "docs", "repo", "deps"]

export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "refactor", "perf", "docs", "test", "chore", "style", "revert"],
    ],
    "scope-enum": [2, "always", [...new Set([...workspaceScopes, ...crossCuttingScopes])].sort()],
    "subject-case": [2, "never", ["upper-case", "start-case", "pascal-case"]],
    "subject-full-stop": [2, "never", "."],
    "header-max-length": [2, "always", 72],
  },
}
