import globals from "globals"
import { baseConfig } from "./base.js"

/** React library preset: base rules plus browser globals and JSX. */
export const reactConfig = [
  ...baseConfig,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // docs/coding-standards.md: function components only.
      "no-restricted-syntax": [
        "error",
        {
          selector: "ClassDeclaration[superClass.name=/^(React\\.)?(Pure)?Component$/]",
          message: "Use function components. Class components are not used in this codebase.",
        },
      ],
    },
  },
]

export default reactConfig
