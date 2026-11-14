import { describe, expect, it } from "vitest"

import { ARCHIVE_LIMITS, inspectArchive } from "./archive"
import type { ArchiveEntry } from "./archive"

/**
 * What a ZIP bundle has to look like before anything is unpacked.
 *
 * Every one of these is a question about metadata, which is why none of
 * them needs an archive. That is also the point: a zip bomb is only a bomb
 * once you decompress it, and a path with `..` in it is only dangerous once
 * you write to it.
 */

function entry(over: Partial<ArchiveEntry> = {}): ArchiveEntry {
  return {
    path: "manifest.json",
    uncompressedBytes: 1_000,
    compressedBytes: 500,
    isSymlink: false,
    isDirectory: false,
    ...over,
  }
}

const SMALL = 10_000

describe("a bundle that is what it says it is", () => {
  it("passes", () => {
    const entries = [
      entry(),
      entry({ path: "checksums.json" }),
      entry({ path: "schema/pages/page_a1b2.json" }),
      entry({ path: "assets/files/ast_9f2a.webp" }),
      entry({ path: "README.md" }),
    ]

    expect(inspectArchive(entries, SMALL)).toEqual({ ok: true })
  })

  it("allows the directories the structure declares", () => {
    const entries = ["schema/", "theme/", "settings/", "assets/files/", "preview/"].map((path) =>
      entry({ path, isDirectory: true, uncompressedBytes: 0, compressedBytes: 0 }),
    )

    expect(inspectArchive(entries, SMALL).ok).toBe(true)
  })

  it("passes an empty archive, which is merely useless", () => {
    // Nothing to refuse. The stage that wants a manifest will say so.
    expect(inspectArchive([], 100).ok).toBe(true)
  })
})

describe("writing somewhere it was not invited", () => {
  it.each(["/etc/passwd", "/manifest.json"])("refuses the absolute path %s", (path) => {
    expect(inspectArchive([entry({ path })], SMALL)).toMatchObject({
      reason: "absolute-path",
      path,
    })
  })

  it("refuses a Windows drive letter, which is absolute somewhere", () => {
    expect(inspectArchive([entry({ path: "C:/windows/system32/x" })], SMALL)).toMatchObject({
      reason: "absolute-path",
    })
  })

  it.each(["../outside.json", "schema/../../outside.json", "assets/files/../../../etc/passwd"])(
    "refuses the traversal %s",
    (path) => {
      expect(inspectArchive([entry({ path })], SMALL)).toMatchObject({ reason: "path-traversal" })
    },
  )

  it("refuses traversal written with backslashes", () => {
    /*
     * `..\\..\\etc` is traversal on the system that matters, and a check
     * that only knew `/` would hand it on to something that does not.
     */
    expect(inspectArchive([entry({ path: "schema\\..\\..\\outside.json" })], SMALL)).toMatchObject({
      reason: "path-traversal",
    })
  })

  it("allows a file whose name merely contains two dots", () => {
    // `..` is a path segment, not a substring. Refusing `a..b.json` would be
    // refusing a filename somebody is allowed to have.
    expect(inspectArchive([entry({ path: "schema/pages/a..b.json" })], SMALL).ok).toBe(true)
  })
})

describe("entries that are not files", () => {
  it("refuses a symlink", () => {
    /*
     * It writes a file pointing somewhere else, so a later read of an
     * innocent path follows it out of the sandbox. Archives record it as a
     * mode flag, which is why it is a field rather than something inferred.
     */
    expect(
      inspectArchive([entry({ path: "assets/files/x.webp", isSymlink: true })], SMALL),
    ).toMatchObject({ reason: "symlink" })
  })

  it("refuses a symlink even where a file would be allowed", () => {
    expect(
      inspectArchive([entry({ path: "manifest.json", isSymlink: true })], SMALL),
    ).toMatchObject({ reason: "symlink" })
  })
})

describe("entries that are not part of a bundle", () => {
  it.each([".ssh/authorized_keys", "evil.sh", "schema.json", "node_modules/x/index.js"])(
    "refuses %s",
    (path) => {
      // Not a bundle with an extra file in it: something else wearing a
      // bundle's name.
      expect(inspectArchive([entry({ path })], SMALL)).toMatchObject({
        reason: "unexpected-entry",
      })
    },
  )

  it("refuses two entries claiming one path", () => {
    /*
     * A checker reads the first and an extractor keeps the last. There is
     * no reading of this that is an honest mistake.
     */
    expect(inspectArchive([entry(), entry()], SMALL)).toMatchObject({
      reason: "duplicate-entry",
      path: "manifest.json",
    })
  })
})

describe("the ceilings", () => {
  it("refuses an archive larger than the limit", () => {
    expect(inspectArchive([entry()], ARCHIVE_LIMITS.maxArchiveBytes + 1)).toMatchObject({
      reason: "archive-too-large",
    })
  })

  it("refuses more entries than a bundle has", () => {
    const many = Array.from({ length: ARCHIVE_LIMITS.maxEntries + 1 }, (_, index) =>
      entry({ path: `assets/files/${String(index)}.webp` }),
    )

    expect(inspectArchive(many, SMALL)).toMatchObject({ reason: "too-many-entries" })
  })

  it("refuses a path nested deeper than a bundle goes", () => {
    const deep = `assets/${Array.from({ length: 11 }, () => "x").join("/")}.webp`

    expect(inspectArchive([entry({ path: deep })], SMALL)).toMatchObject({
      reason: "path-too-deep",
    })
  })

  it("refuses one file larger than the limit", () => {
    const huge = entry({
      path: "assets/files/big.webp",
      uncompressedBytes: ARCHIVE_LIMITS.maxEntryBytes + 1,
      compressedBytes: ARCHIVE_LIMITS.maxEntryBytes,
    })

    expect(inspectArchive([huge], SMALL)).toMatchObject({ reason: "entry-too-large" })
  })

  it("refuses an archive that admits to unpacking past the limit", () => {
    /*
     * The declared sizes are a claim by whoever wrote the file. Checked
     * anyway, because an archive that admits to being 600 MB can be refused
     * without reading a byte of it.
     */
    const entries = Array.from({ length: 20 }, (_, index) =>
      entry({
        path: `assets/files/${String(index)}.webp`,
        uncompressedBytes: 30 * 1_000_000,
        compressedBytes: 29 * 1_000_000,
      }),
    )

    expect(inspectArchive(entries, 90 * 1_000_000)).toMatchObject({
      reason: "uncompressed-too-large",
    })
  })
})

describe("a zip bomb", () => {
  it("is refused on one entry's ratio", () => {
    // 500 MB of zeroes is half a megabyte on disk.
    const bomb = entry({
      path: "assets/files/bomb.webp",
      uncompressedBytes: 40 * 1_000_000,
      compressedBytes: 40_000,
    })

    expect(inspectArchive([bomb], SMALL)).toMatchObject({
      reason: "compression-ratio",
      path: "assets/files/bomb.webp",
    })
  })

  it("is refused on the whole when no single entry is past the ratio", () => {
    /*
     * A thousand files each just under the per-entry ratio add up to the
     * same bomb, which is why the ratio is checked twice.
     */
    const entries = Array.from({ length: 40 }, (_, index) =>
      entry({
        path: `assets/files/${String(index)}.webp`,
        uncompressedBytes: 1_000_000,
        compressedBytes: 11_000,
      }),
    )

    expect(inspectArchive(entries, 100_000)).toMatchObject({ reason: "compression-ratio" })
  })

  it("is not claimed for a file that simply compresses well", () => {
    // JSON compresses ten to one without being an attack on anybody.
    const text = entry({
      path: "schema/pages/page_a1b2.json",
      uncompressedBytes: 200_000,
      compressedBytes: 20_000,
    })

    expect(inspectArchive([text], 20_000).ok).toBe(true)
  })

  it("is not claimed for an entry that compresses to nothing", () => {
    // A zero-byte file has no ratio. Dividing by its size would be an
    // infinity, and refusing an empty file would be refusing a real one.
    const empty = entry({
      path: "assets/files/empty.webp",
      uncompressedBytes: 0,
      compressedBytes: 0,
    })

    expect(inspectArchive([empty], SMALL).ok).toBe(true)
  })
})
