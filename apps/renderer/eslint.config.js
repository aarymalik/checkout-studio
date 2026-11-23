import globals from "globals"
import { nextConfig } from "@checkout-studio/config/eslint/next"
import { boundariesConfig } from "@checkout-studio/config/eslint/boundaries"

export default [
  ...nextConfig,
  boundariesConfig("renderer", { kind: "app" }),
  {
    /*
     * The embed loader is a plain browser script, served as-is from
     * `public/` with no build step — see the file for why. The application's
     * configuration assumes TypeScript modules compiled by Next, so it reads
     * `document` as undefined and every diagnostic as a stray console call.
     *
     * Narrowed to this one directory rather than relaxed anywhere else.
     */
    files: ["public/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: globals.browser,
    },
    rules: {
      // It runs on somebody else's page, where the console is the only
      // channel it has for saying the snippet is wrong.
      "no-console": "off",
    },
  },
]
