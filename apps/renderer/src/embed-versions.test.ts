import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { LOADER_VERSIONS, currentLoader } from "./embed-versions"

/**
 * That a published loader build is still the build that was published.
 *
 * This is the whole mechanism. A merchant pinning a version trusts its
 * bytes never to change, and nothing else in the repository would notice if
 * they did — not a type, not a lint rule, not a rendering test. If this
 * fails, the answer is never to update the hash: it is to put the change in
 * a new version and leave the old bytes alone.
 */

/*
 * Joined rather than built with `new URL(…, import.meta.url)`. Vite rewrites
 * that form at build time into an asset reference, and with an interpolated
 * path it rewrites it into nothing — the first version of this test was
 * reading a file called "undefined" and reporting it as a changed hash.
 */
const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "..", "public")

function fileFor(path: string): string {
  return join(PUBLIC, path)
}

describe("every published loader build", () => {
  it("still hashes to what was published", async () => {
    for (const version of LOADER_VERSIONS) {
      const bytes = await readFile(fileFor(version.path))
      const digest = `sha384-${createHash("sha384").update(bytes).digest("base64")}`

      expect(digest, `${version.path} has changed since it was published`).toBe(version.integrity)
    }
  })

  it("is offered newest last, which is what the Studio shows", () => {
    expect(currentLoader()).toBe(LOADER_VERSIONS.at(-1))
  })

  it("names a hash a browser will accept", () => {
    for (const version of LOADER_VERSIONS) {
      // sha384, base64, and the prefix a browser matches on. A hash in any
      // other shape is ignored rather than refused, which would mean the
      // attribute was decorative.
      expect(version.integrity).toMatch(/^sha384-[A-Za-z0-9+/]{64}=*$/u)
    }
  })
})

describe("the living loader", () => {
  it("is not one of the frozen ones", () => {
    /*
     * `/embed.js` must never appear here. It is the path that changes, and
     * offering it with an integrity hash would hand merchants a page that
     * breaks the next time we fix something.
     */
    expect(LOADER_VERSIONS.some((version) => version.path === "/embed.js")).toBe(false)
  })
})
