import { readFileSync } from "node:fs"
import { readdir } from "node:fs/promises"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Fails when a component carries a value that should have been a token.
 *
 * The design system is only worth having if nothing bypasses it. A single
 * `#fff` survives every mode switch, every rebrand and every contrast audit —
 * silently, because it looks right in the mode its author was using.
 *
 * Tokens themselves are exempt: somewhere has to hold the values, and that
 * somewhere is packages/design-system/src/tokens.
 *
 * See docs/design-system.md and docs/coding-standards.md.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url))

/** Where components live. Everything under these is checked. */
const SEARCH = ["packages/ui/src", "packages/editor/src", "packages/renderer/src", "apps"]

/** The tier that is allowed to hold raw values, plus what cannot be tokenised. */
const EXEMPT = [
  "packages/design-system/src",
  "/node_modules/",
  "/.next/",
  "/coverage/",
  "/.turbo/",
]

/**
 * The 8px spacing system from docs/design-system.md, as Tailwind multiples of
 * the 4px base: 4 8 12 16 24 32 40 48 64 80 96.
 *
 * "Never use arbitrary spacing" is easy to agree with and easy to drift from —
 * a 6px gap or a 10px padding looks right in isolation and puts the component
 * permanently out of step with every other one.
 */
const SPACING_STEPS = new Set(["0", "1", "2", "3", "4", "6", "8", "10", "12", "16", "20", "24"])

/**
 * Utilities that take a spacing step.
 *
 * Dimensions are not spacing: a control's height, an icon's size and a switch
 * thumb's travel answer to the design, not to the page's vertical rhythm.
 * Transforms are left out for the same reason — centring a 16px thumb in a 20px
 * track needs 2px, and no rounding of that is correct.
 */
const SPACING_UTILITIES =
  "p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y|inset|inset-x|inset-y|top|right|bottom|left"

const RULES = [
  {
    name: "colour",
    // #rgb, #rrggbb, rgb(), rgba(), hsl(), hsla(), oklch()
    pattern: /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|color-mix)\s*\(/gi,
    advice: "use a semantic colour token (bg-surface, text-foreground, …)",
  },
  {
    name: "length",
    // A raw pixel value in a style string or a Tailwind arbitrary value.
    pattern: /\b\d+(?:\.\d+)?px\b/g,
    advice: "use a spacing, radius or size token",
  },
  {
    name: "duration",
    pattern: /\b\d+ms\b/g,
    advice: "use duration-fast, duration-normal or duration-slow",
  },
  {
    name: "spacing step",
    pattern: new RegExp(`(?<![\\w-])-?(?:${SPACING_UTILITIES})-(\\d+(?:\\.\\d+)?)(?![\\w.-])`, "g"),
    allow: (match) => SPACING_STEPS.has(match[1]),
    advice: "use a step from the 8px system: 0 1 2 3 4 6 8 10 12 16 20 24",
  },
  {
    name: "arbitrary utility",
    // Tailwind escape hatches: bg-[#fff], p-[13px], duration-[120ms]
    pattern: /\b[a-z-]+-\[[^\]]*(?:#|\d+px|\d+ms)[^\]]*\]/g,
    advice: "add a token instead of reaching past the scale",
  },
]

/** A line that says why it is exempt is exempt. */
const ALLOW_MARKER = "design-system-ignore"

/**
 * Comment-only lines are skipped.
 *
 * Explaining why a control is 16px square is exactly the kind of comment worth
 * writing, and flagging it teaches people to stop explaining themselves.
 */
const COMMENT_ONLY = /^\s*(?:\/\/|\/\*|\*|<!--)/

async function* sourceFiles(directory) {
  let entries

  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (EXEMPT.some((exempt) => path.includes(exempt))) continue

    if (entry.isDirectory()) {
      yield* sourceFiles(path)
    } else if (/\.(tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      yield path
    }
  }
}

/**
 * Scans directories and returns every value that should have been a token.
 *
 * Exported so the rules can be tested against a fixture rather than against
 * whatever the repository happens to contain: a checker that passes because
 * there is nothing to check is not a checker.
 */
export async function findHardcodedValues(directories = SEARCH, root = ROOT) {
  const findings = []

  for (const directory of directories) {
    for await (const file of sourceFiles(join(root, directory))) {
      const lines = readFileSync(file, "utf8").split("\n")

      lines.forEach((line, index) => {
        if (line.includes(ALLOW_MARKER)) return
        if (COMMENT_ONLY.test(line)) return

        for (const rule of RULES) {
          rule.pattern.lastIndex = 0

          // Every match, not the first: a rule with a validator has to look at
          // each one, since an allowed value earlier on the line says nothing
          // about a disallowed one after it.
          const offending = [...line.matchAll(rule.pattern)].find(
            (match) => rule.allow === undefined || !rule.allow(match),
          )
          if (!offending) continue

          findings.push({
            file: relative(root, file),
            line: index + 1,
            rule: rule.name,
            value: offending[0],
            advice: rule.advice,
          })
        }
      })
    }
  }

  return findings
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url)

if (!invokedDirectly) {
  // Imported for its rules; the caller decides what to scan.
} else {
  const findings = await findHardcodedValues()

  if (findings.length > 0) {
    process.stderr.write("Hardcoded values that belong in the design system:\n\n")

    for (const finding of findings) {
      process.stderr.write(
        `  ${finding.file}:${finding.line}  ${finding.rule} "${finding.value}"\n` +
          `    ${finding.advice}\n`,
      )
    }

    process.stderr.write(
      `\n${findings.length} finding${findings.length === 1 ? "" : "s"}. ` +
        `A value that cannot be tokenised may carry a "${ALLOW_MARKER}" comment saying why.\n`,
    )

    process.exit(1)
  }

  process.stdout.write("No hardcoded design values outside the token tier.\n")
}
