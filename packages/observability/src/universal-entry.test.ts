import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/**
 * The root entry must run in a browser.
 *
 * A component logs — an error boundary logs the render that failed — so the
 * logger's module graph reaches client code. A static import of a Node builtin
 * anywhere in that graph is not a missing polyfill: Turbopack refuses to bundle
 * one for the browser, and the page fails to build at all. That is how this was
 * found, by a gallery page that would not compile.
 */
const SOURCE = fileURLToPath(new URL(".", import.meta.url))

/** Walks the import graph from a file, following relative imports only. */
function reachableFrom(entry: string): Set<string> {
  const seen = new Set<string>()
  const queue = [entry]

  while (queue.length > 0) {
    const file = queue.pop()
    if (file === undefined || seen.has(file)) continue
    seen.add(file)

    const contents = readFileSync(file, "utf8")

    for (const match of contents.matchAll(/from\s+"(\.[^"]+)"/g)) {
      const specifier = match[1] as string

      // Relative imports are extensionless by convention, so both spellings of
      // the target are tried.
      for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
        const resolved = resolve(dirname(file), candidate)

        try {
          readFileSync(resolved, "utf8")
          queue.push(resolved)
          break
        } catch {
          // Not this spelling; try the next.
        }
      }
    }
  }

  return seen
}

function nodeBuiltinsUsedBy(files: Iterable<string>): string[] {
  const found: string[] = []

  for (const file of files) {
    for (const match of readFileSync(file, "utf8").matchAll(/from\s+"(node:[^"]+)"/g)) {
      found.push(`${file.replace(SOURCE, "")} → ${match[1] ?? ""}`)
    }
  }

  return found
}

describe("the root entry", () => {
  it("reaches no Node builtin, so a component can log", () => {
    expect(nodeBuiltinsUsedBy(reachableFrom(resolve(SOURCE, "index.ts")))).toEqual([])
  })

  it("does not reach the AsyncLocalStorage context at all", () => {
    const reachable = [...reachableFrom(resolve(SOURCE, "index.ts"))]

    expect(reachable.filter((file) => file.endsWith("context/server.ts"))).toEqual([])
  })

  it("is the server entry that carries it", () => {
    // And it must: importing ./server is what registers where the context lives.
    const reachable = [...reachableFrom(resolve(SOURCE, "server.ts"))]

    expect(reachable.some((file) => file.endsWith("context/server.ts"))).toBe(true)
  })
})
