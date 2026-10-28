/**
 * What an upload is, decided from its bytes.
 *
 * ## An allowlist, matched on content
 *
 * docs/security.md § File Upload Security permits images, SVG, videos, fonts
 * and PDF, and says to reject executable files. This is the allowlist that
 * implements the first half, and the second half follows from it: a file whose
 * bytes match nothing here is refused, so an executable is refused without
 * anybody having to enumerate the executable formats. An allowlist that is
 * wrong is a file somebody cannot upload; a blocklist that is wrong is a file
 * nobody should have been able to.
 *
 * ## Why the signature and not the extension
 *
 * Neither the filename nor the browser's `Content-Type` is evidence. Both are
 * typed by whoever made the request, and `logo.png` carrying an ELF header is
 * the oldest upload attack there is. So every type here is identified by the
 * bytes at the front of the file, and the type recorded against the asset is
 * the one that matched — never the one the request claimed.
 *
 * `inspect.ts` does not accept a declared type at all, so there is no
 * parameter holding a value that must not be trusted.
 */

/** The broad kinds, which carry the size ceilings and the handling rules. */
export const UPLOAD_KINDS = ["image", "vector", "video", "font", "document"] as const

export type UploadKind = (typeof UPLOAD_KINDS)[number]

export interface UploadType {
  kind: UploadKind
  /** The media type this is stored and served as. */
  mimeType: string
  /** The extension the stored object gets. Without a dot. */
  extension: string
}

/**
 * A byte signature, as a sparse pattern.
 *
 * `at` is where the pattern starts. A container format writes its brand after
 * a length prefix, so a signature is not always at zero: an MP4 announces
 * itself with `ftyp` four bytes in, and its brand four bytes after that.
 */
interface Signature {
  at: number
  bytes: readonly number[]
}

interface Candidate extends UploadType {
  /** Every signature must match for this candidate to be chosen. */
  signatures: readonly Signature[]
}

/** `"GIF87a"` as the bytes it is, so the table reads as the format's own spec. */
function ascii(text: string): readonly number[] {
  return [...text].map((character) => character.codePointAt(0) as number)
}

/**
 * The permitted types, in the order they are tried.
 *
 * Order matters only where one signature is a prefix of another, which is why
 * the `ftyp` brands are separate entries rather than one video candidate: an
 * AVIF is an ISO base media file too, and it is an image.
 */
const CANDIDATES: readonly Candidate[] = [
  {
    kind: "image",
    mimeType: "image/png",
    extension: "png",
    signatures: [{ at: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  },
  {
    kind: "image",
    mimeType: "image/jpeg",
    extension: "jpg",
    signatures: [{ at: 0, bytes: [0xff, 0xd8, 0xff] }],
  },
  {
    kind: "image",
    mimeType: "image/gif",
    extension: "gif",
    signatures: [{ at: 0, bytes: ascii("GIF87a") }],
  },
  {
    kind: "image",
    mimeType: "image/gif",
    extension: "gif",
    signatures: [{ at: 0, bytes: ascii("GIF89a") }],
  },
  {
    kind: "image",
    mimeType: "image/webp",
    extension: "webp",
    // RIFF, then four bytes of length, then the form type. Both halves are
    // checked: `RIFF` alone is also a WAV and an AVI.
    signatures: [
      { at: 0, bytes: ascii("RIFF") },
      { at: 8, bytes: ascii("WEBP") },
    ],
  },
  {
    kind: "image",
    mimeType: "image/avif",
    extension: "avif",
    signatures: [
      { at: 4, bytes: ascii("ftyp") },
      { at: 8, bytes: ascii("avif") },
    ],
  },
  {
    kind: "video",
    mimeType: "video/mp4",
    extension: "mp4",
    signatures: [
      { at: 4, bytes: ascii("ftyp") },
      { at: 8, bytes: ascii("isom") },
    ],
  },
  {
    kind: "video",
    mimeType: "video/mp4",
    extension: "mp4",
    signatures: [
      { at: 4, bytes: ascii("ftyp") },
      { at: 8, bytes: ascii("mp42") },
    ],
  },
  {
    kind: "video",
    mimeType: "video/webm",
    extension: "webm",
    // The EBML header, shared with Matroska. A `.mkv` renamed to `.webm` is
    // still a WebM container to a browser, which is the thing that matters.
    signatures: [{ at: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] }],
  },
  {
    kind: "font",
    mimeType: "font/woff2",
    extension: "woff2",
    signatures: [{ at: 0, bytes: ascii("wOF2") }],
  },
  {
    kind: "font",
    mimeType: "font/woff",
    extension: "woff",
    signatures: [{ at: 0, bytes: ascii("wOFF") }],
  },
  {
    kind: "font",
    mimeType: "font/otf",
    extension: "otf",
    signatures: [{ at: 0, bytes: ascii("OTTO") }],
  },
  {
    kind: "font",
    mimeType: "font/ttf",
    extension: "ttf",
    // The version number 1.0 as a fixed-point 32-bit integer, which is what a
    // TrueType file opens with.
    signatures: [{ at: 0, bytes: [0x00, 0x01, 0x00, 0x00] }],
  },
  {
    kind: "document",
    mimeType: "application/pdf",
    extension: "pdf",
    signatures: [{ at: 0, bytes: ascii("%PDF-") }],
  },
]

/**
 * No length check: an index past the end of a `Uint8Array` reads `undefined`,
 * which equals no byte, so a file too short to carry the pattern fails on its
 * first missing byte. A guard would have been a second way of saying the same
 * thing, and mutation testing proved it unreachable.
 */
function matches(bytes: Uint8Array, signature: Signature): boolean {
  return signature.bytes.every((byte, index) => bytes[signature.at + index] === byte)
}

/**
 * The type these bytes are, or null if they are not a permitted one.
 *
 * SVG is not here. It carries no signature — it is XML, and an XML document
 * announces nothing about what it draws — so it is recognised separately, by
 * `looksLikeSvg`, and handled differently because it is the one permitted type
 * that can contain script.
 */
export function signatureOf(bytes: Uint8Array): UploadType | null {
  const found = CANDIDATES.find((candidate) =>
    candidate.signatures.every((signature) => matches(bytes, signature)),
  )

  if (found === undefined) return null

  return { kind: found.kind, mimeType: found.mimeType, extension: found.extension }
}

/** What an SVG would be recorded as, once there is something to sanitize one. */
export const SVG_TYPE: UploadType = {
  kind: "vector",
  mimeType: "image/svg+xml",
  extension: "svg",
}

/**
 * Whether these bytes are offered as an SVG.
 *
 * Deliberately generous about what opens a document, and deliberately narrow
 * about where it looks. Anything that *begins* as XML is treated as an SVG,
 * because the safe direction is to say yes too often: a file that reaches the
 * SVG path is sanitized, and one that does not is refused as unrecognised.
 * Being strict here would be a way to smuggle an unsanitized SVG past the
 * check by making it not quite look like one.
 *
 * Only the head is read, which is what keeps a raster image out of the SVG
 * path: a PNG with `<svg` in a metadata chunk does not *begin* with it. That,
 * rather than the order the two checks run in, is the thing doing the work —
 * no permitted signature starts with `<`, so the two can never both match.
 */
export function looksLikeSvg(bytes: Uint8Array): boolean {
  /*
   * 1 KiB is far past any leading whitespace, comment or declaration a
   * document opens with.
   *
   * No byte order mark to strip: `TextDecoder` removes a leading one while
   * decoding, since `ignoreBOM` defaults to false — which, against its name,
   * means the mark is consumed rather than kept as a character. Handling it
   * here was a branch nothing could reach, and the coverage floor said so.
   */
  const head = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.subarray(0, 1024))
    .trimStart()
    .toLowerCase()

  return head.startsWith("<?xml") || head.startsWith("<svg") || head.startsWith("<!doctype svg")
}
