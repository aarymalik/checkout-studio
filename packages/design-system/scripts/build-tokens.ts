import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { generateVariablesCss } from "../src/css/generate"

/** Writes the generated stylesheet. A test asserts the result is committed. */
const target = fileURLToPath(new URL("../src/css/variables.css", import.meta.url))

writeFileSync(target, generateVariablesCss())
process.stdout.write(`Wrote ${target}\n`)
