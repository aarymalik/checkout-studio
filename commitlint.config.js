/**
 * Conventional Commits, per contributing.md.
 * Scopes match the packages and apps in the workspace.
 */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "refactor", "perf", "docs", "test", "chore", "style", "revert"],
    ],
    "scope-enum": [
      2,
      "always",
      [
        "editor",
        "renderer",
        "schema",
        "ui",
        "design-system",
        "api",
        "database",
        "plugin-sdk",
        "hooks",
        "utils",
        "types",
        "observability",
        "config",
        "studio",
        "checkout",
        "stripe",
        "auth",
        "docs",
        "repo",
        "deps",
      ],
    ],
    "subject-case": [2, "never", ["upper-case", "start-case", "pascal-case"]],
    "subject-full-stop": [2, "never", "."],
    "header-max-length": [2, "always", 72],
  },
}
