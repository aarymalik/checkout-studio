import js from "@eslint/js"
import globals from "globals"
import tseslint from "typescript-eslint"
import prettier from "eslint-config-prettier"

/**
 * The single ESLint rule set for the repository, per docs/coding-standards.md.
 * Every package extends this; none redefines it.
 */
export const ignores = {
  ignores: [
    "**/dist/**",
    "**/.next/**",
    "**/coverage/**",
    "**/.turbo/**",
    "**/playwright-report/**",
    "**/node_modules/**",
  ],
}

export const baseConfig = tseslint.config(
  ignores,
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.es2021 },
    },
    rules: {
      // docs/coding-standards.md: never `any`; use `unknown` or a real type.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // docs/coding-standards.md: never swallow an error.
      "no-empty": ["error", { allowEmptyCatch: false }],
      // docs/coding-standards.md: structured logging only.
      "no-console": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSEnumDeclaration",
          message: "Avoid enums. Use a const array with a derived union type.",
        },
        {
          selector: "CallExpression[callee.name='eval']",
          message: "eval() is forbidden. Schema content is never executed.",
        },
        {
          selector: "NewExpression[callee.name='Function']",
          message: "new Function() is forbidden. Schema content is never executed.",
        },
      ],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "prefer-const": "error",
      "no-var": "error",
    },
  },
  {
    // Tests may reach for the console and for fixtures typed loosely.
    files: ["**/*.test.ts", "**/*.test.tsx", "**/tests/**", "**/e2e/**"],
    rules: { "no-console": "off" },
  },
  {
    // Repository tooling runs in Node and reports to the terminal.
    files: ["**/scripts/**", "**/*.config.{js,mjs,ts}", "**/*.cjs"],
    languageOptions: { globals: { ...globals.node } },
    rules: { "no-console": "off" },
  },
)

export default baseConfig
