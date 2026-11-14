import "server-only"

/**
 * What a ZIP bundle has to look like before anything is unpacked from it.
 *
 * docs/export-import.md § Archive Hardening, which is a list of limits and a
 * list of refusals. Both are here, and neither needs a ZIP library: every
 * one of them is a question about an entry's *metadata*, and metadata is
 * what a central directory holds. Checking before extracting is the whole
 * point — a zip bomb is only a bomb once you decompress it, and a path with
 * `..` in it is only dangerous once you write to it.
 *
 * ## The refusals, and what each is actually about
 *
 * An **absolute path** or one containing **`..`** is an attempt to write
 * outside wherever the extraction goes. Zip Slip, and the reason the spec
 * says extraction happens "to an isolated temporary namespace, never to a
 * project directory" — this is the belt to that's braces.
 *
 * A **symlink** writes a file that points somewhere else, so a later read of
 * an innocent-looking path follows it out of the sandbox. Archives carry
 * them as a mode flag rather than as content, which is why this takes it as
 * a field rather than inferring it.
 *
 * **Duplicate names** are how two things claim one path: a checker reads the
 * first and the extractor keeps the last. The archive is refused rather than
 * deduplicated, because there is no reading of two entries with one name
 * that is an honest mistake.
 *
 * A **compression ratio** past the limit is a zip bomb — 500 MB of zeroes is
 * half a megabyte on disk — and the ratio is checked per entry as well as
 * over the whole, because one entry is enough.
 *
 * **Path depth** and **entry count** are not security so much as sanity: a
 * bundle is a page, not a filesystem, and something with four thousand files
 * in it is not the thing this format is for.
 *
 * ## Nothing here trusts a declared size
 *
 * The uncompressed sizes come from the archive's own directory and are a
 * claim by whoever wrote it. They are checked anyway, because an archive
 * that *admits* to being 600 MB can be refused without reading a byte — and
 * then the extractor counts what actually arrives, which is the check that
 * cannot be lied to. One is cheap and one is true; both are wanted.
 */

export interface ArchiveEntry {
  /** As recorded in the archive, before any normalizing. */
  path: string
  /** What the directory claims it unpacks to. */
  uncompressedBytes: number
  compressedBytes: number
  /** Archives record this in the entry's mode, not its contents. */
  isSymlink: boolean
  isDirectory: boolean
}

export interface ArchiveLimits {
  maxArchiveBytes: number
  maxUncompressedBytes: number
  maxRatio: number
  maxEntries: number
  maxDepth: number
  maxEntryBytes: number
}

/** The ceilings docs/export-import.md § Archive Hardening sets. */
export const ARCHIVE_LIMITS: ArchiveLimits = {
  maxArchiveBytes: 100 * 1_000_000,
  maxUncompressedBytes: 500 * 1_000_000,
  maxRatio: 100,
  maxEntries: 5_000,
  maxDepth: 10,
  maxEntryBytes: 50 * 1_000_000,
}

export type ArchiveRefusal =
  | "archive-too-large"
  | "too-many-entries"
  | "absolute-path"
  | "path-traversal"
  | "symlink"
  | "duplicate-entry"
  | "path-too-deep"
  | "entry-too-large"
  | "uncompressed-too-large"
  | "compression-ratio"
  | "unexpected-entry"

export type ArchiveInspection =
  | { ok: true }
  | {
      ok: false
      reason: ArchiveRefusal
      /** The entry that caused it, when one did. */
      path?: string
      message: string
    }

/**
 * The directories a bundle's entries may sit in.
 *
 * From § ZIP Bundle Structure. "Entries outside the declared structure" is a
 * refusal in its own right: an archive carrying `.ssh/authorized_keys` is
 * not a bundle with an extra file in it, it is something else wearing a
 * bundle's name.
 */
const ALLOWED_ROOTS = ["schema/", "theme/", "settings/", "assets/", "preview/"]
const ALLOWED_FILES = ["manifest.json", "checksums.json", "README.md"]

export function inspectArchive(
  entries: readonly ArchiveEntry[],
  archiveBytes: number,
  limits: ArchiveLimits = ARCHIVE_LIMITS,
): ArchiveInspection {
  if (archiveBytes > limits.maxArchiveBytes) {
    return refuse("archive-too-large", `This file is larger than ${mb(limits.maxArchiveBytes)}.`)
  }

  if (entries.length > limits.maxEntries) {
    return refuse("too-many-entries", `A bundle holds at most ${String(limits.maxEntries)} files.`)
  }

  const seen = new Set<string>()
  let uncompressed = 0

  for (const entry of entries) {
    const problem = inspectEntry(entry, limits, seen)

    if (problem !== null) return problem

    seen.add(entry.path)
    uncompressed += entry.uncompressedBytes
  }

  if (uncompressed > limits.maxUncompressedBytes) {
    return refuse(
      "uncompressed-too-large",
      `This bundle unpacks to more than ${mb(limits.maxUncompressedBytes)}.`,
    )
  }

  /*
   * Over the whole archive as well as per entry. A thousand files each just
   * under the per-entry ratio add up to the same bomb.
   */
  if (archiveBytes > 0 && uncompressed / archiveBytes > limits.maxRatio) {
    return refuse("compression-ratio", "This bundle unpacks to far more than its size suggests.")
  }

  return { ok: true }
}

function inspectEntry(
  entry: ArchiveEntry,
  limits: ArchiveLimits,
  seen: ReadonlySet<string>,
): ArchiveInspection | null {
  const { path } = entry

  if (entry.isSymlink) {
    return refuse("symlink", `${path} is a link, and a bundle carries files.`, path)
  }

  /*
   * Backslashes first. A path written `..\\..\\etc` is traversal on the
   * system that matters, and a check that only knew `/` would pass it
   * through to be interpreted later by something that does not.
   */
  const normalized = path.replaceAll("\\", "/")

  if (normalized.startsWith("/") || /^[a-zA-Z]:/u.test(normalized)) {
    return refuse("absolute-path", `${path} is an absolute path.`, path)
  }

  if (normalized.split("/").includes("..")) {
    return refuse("path-traversal", `${path} points outside the bundle.`, path)
  }

  if (seen.has(path)) {
    return refuse("duplicate-entry", `${path} appears twice.`, path)
  }

  if (normalized.split("/").filter((part) => part !== "").length > limits.maxDepth) {
    return refuse("path-too-deep", `${path} is nested deeper than a bundle goes.`, path)
  }

  if (entry.isDirectory) return null

  if (!declared(normalized)) {
    return refuse("unexpected-entry", `${path} is not part of a bundle.`, path)
  }

  if (entry.uncompressedBytes > limits.maxEntryBytes) {
    return refuse("entry-too-large", `${path} is larger than ${mb(limits.maxEntryBytes)}.`, path)
  }

  if (
    entry.compressedBytes > 0 &&
    entry.uncompressedBytes / entry.compressedBytes > limits.maxRatio
  ) {
    return refuse("compression-ratio", `${path} unpacks to far more than its size.`, path)
  }

  return null
}

function declared(path: string): boolean {
  return ALLOWED_FILES.includes(path) || ALLOWED_ROOTS.some((root) => path.startsWith(root))
}

function refuse(reason: ArchiveRefusal, message: string, path?: string): ArchiveInspection {
  return { ok: false, reason, message, ...(path === undefined ? {} : { path }) }
}

function mb(bytes: number): string {
  return `${String(Math.round(bytes / 1_000_000))} MB`
}
