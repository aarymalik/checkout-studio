import { SCOPE, allowedDependencies, reasonFor } from "../layers.js"

/**
 * Layer enforcement, generated from layers.js.
 *
 * A forbidden import fails lint with the reason the boundary exists, so the
 * rule teaches the architecture at the moment someone crosses it.
 *
 * @param {string} packageName bare package name, e.g. "editor"
 * @param {{ kind?: "package" | "plugin" | "app" }} [options]
 */
export function boundariesConfig(packageName, options = {}) {
  const allowed = new Set(allowedDependencies(packageName, options))

  const everyWorkspacePackage = allowedDependencies("*", { kind: "app" })
  const forbidden = everyWorkspacePackage.filter((name) => !allowed.has(name))

  const paths = forbidden.map((dependency) => ({
    name: `${SCOPE}/${dependency}`,
    message: `${packageName} may not import ${SCOPE}/${dependency}. ${reasonFor(packageName, dependency, options)}`,
  }))

  return {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths,
          patterns: [
            {
              group: [`${SCOPE}/*/src/*`, `${SCOPE}/*/dist/*`],
              message:
                "Import from the package root. Deep imports break encapsulation, per docs/monorepo-structure.md.",
            },
            ...forbidden.map((dependency) => ({
              group: [`${SCOPE}/${dependency}/*`],
              message: `${packageName} may not import ${SCOPE}/${dependency}. ${reasonFor(packageName, dependency, options)}`,
            })),
            {
              group: ["**/apps/*", "**/../apps/**"],
              message: "Nothing may import from an application. Apps are leaves.",
            },
          ],
        },
      ],
    },
  }
}

export default boundariesConfig
