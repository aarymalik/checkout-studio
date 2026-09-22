import globals from "globals"
import { baseConfig } from "@checkout-studio/config/eslint/base"
import { boundariesConfig } from "@checkout-studio/config/eslint/boundaries"
import { LAYERS } from "@checkout-studio/config/layers"

/**
 * Root configuration, used when ESLint runs from the workspace root — by
 * lint-staged on commit, and by `pnpm exec eslint .`.
 *
 * Each package also has its own config, which is what `turbo lint` runs. Both
 * derive their boundaries from layers.js, so they cannot disagree.
 */
const packages = LAYERS.flat().filter((name) => name !== "config")
const apps = ["studio", "renderer"]

export default [
  ...baseConfig,
  {
    files: ["**/*.tsx"],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    files: ["apps/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  ...packages.map((name) => ({
    ...boundariesConfig(name),
    files: [`packages/${name}/**/*.{ts,tsx}`],
  })),
  ...apps.map((name) => ({
    ...boundariesConfig(name, { kind: "app" }),
    files: [`apps/${name}/**/*.{ts,tsx}`],
  })),
]
