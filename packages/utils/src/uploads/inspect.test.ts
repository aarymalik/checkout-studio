import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"

import { DEFAULT_LIMITS, contentHash, inspectUpload } from "./inspect"
import type { InspectInput, UploadInspection } from "./inspect"

/**
 * The gate in front of the asset pipeline.
 *
 * Everything after it assumes the bytes are a type we chose and a size we can
 * work on, so these tests are about what gets through rather than about what
 * the answer looks like. The ones that matter most are the refusals: an
 * allowlist that accepts one thing too many is the whole of upload security
 * gone.
 */

/** A file as it actually begins, so the table is evidence and not a guess. */
const BYTES = {
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d],
  jpeg: [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46],
  gif87: [...Buffer.from("GIF87a"), 0x01, 0x00],
  gif89: [...Buffer.from("GIF89a"), 0x01, 0x00],
  webp: [...Buffer.from("RIFF"), 0x1a, 0x00, 0x00, 0x00, ...Buffer.from("WEBP")],
  avif: [0x00, 0x00, 0x00, 0x1c, ...Buffer.from("ftyp"), ...Buffer.from("avif")],
  mp4: [0x00, 0x00, 0x00, 0x18, ...Buffer.from("ftyp"), ...Buffer.from("isom")],
  mp42: [0x00, 0x00, 0x00, 0x18, ...Buffer.from("ftyp"), ...Buffer.from("mp42")],
  webm: [0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00],
  woff2: [...Buffer.from("wOF2"), 0x00, 0x01],
  woff: [...Buffer.from("wOFF"), 0x00, 0x01],
  otf: [...Buffer.from("OTTO"), 0x00, 0x01],
  ttf: [0x00, 0x01, 0x00, 0x00, 0x00, 0x0f],
  pdf: [...Buffer.from("%PDF-1.7"), 0x0a],
} as const

/** What an upload must never be. */
const HOSTILE = {
  /** Linux. */
  elf: [0x7f, ...Buffer.from("ELF"), 0x02, 0x01, 0x01, 0x00],
  /** Windows: an MZ stub, which is also every .exe and .dll. */
  pe: [...Buffer.from("MZ"), 0x90, 0x00, 0x03, 0x00],
  /** macOS, 64-bit. */
  machO: [0xcf, 0xfa, 0xed, 0xfe, 0x07, 0x00, 0x00, 0x01],
  /** A script, which needs no header at all to run. */
  shell: [...Buffer.from("#!/bin/sh\nrm -rf /\n")],
  /** A zip, which is a jar, a docx, and a way to smuggle anything. */
  zip: [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00],
  /** A Windows shortcut, which executes on view. */
  lnk: [0x4c, 0x00, 0x00, 0x00, 0x01, 0x14, 0x02, 0x00],
} as const

function upload(bytes: readonly number[], fileName = "file.bin"): UploadInspection {
  return inspectUpload({ bytes: new Uint8Array(bytes), fileName })
}

function accepted(result: UploadInspection) {
  if (!result.ok) throw new Error(`refused: ${result.reason}`)

  return result
}

describe("the types that are permitted", () => {
  it.each([
    ["png", BYTES.png, "image/png", "image"],
    ["jpeg", BYTES.jpeg, "image/jpeg", "image"],
    ["gif87a", BYTES.gif87, "image/gif", "image"],
    ["gif89a", BYTES.gif89, "image/gif", "image"],
    ["webp", BYTES.webp, "image/webp", "image"],
    ["avif", BYTES.avif, "image/avif", "image"],
    ["mp4", BYTES.mp4, "video/mp4", "video"],
    ["mp4 (mp42)", BYTES.mp42, "video/mp4", "video"],
    ["webm", BYTES.webm, "video/webm", "video"],
    ["woff2", BYTES.woff2, "font/woff2", "font"],
    ["woff", BYTES.woff, "font/woff", "font"],
    ["otf", BYTES.otf, "font/otf", "font"],
    ["ttf", BYTES.ttf, "font/ttf", "font"],
    ["pdf", BYTES.pdf, "application/pdf", "document"],
  ])("accepts a %s and records what it is", (_name, bytes, mimeType, kind) => {
    const result = accepted(upload(bytes))

    expect(result.type.mimeType).toBe(mimeType)
    expect(result.type.kind).toBe(kind)
  })

  it("tells an AVIF from an MP4, which share a container", () => {
    // Both are ISO base media files. Only the brand four bytes later says
    // which, and getting it wrong would serve a still image as a video.
    expect(accepted(upload(BYTES.avif)).type.kind).toBe("image")
    expect(accepted(upload(BYTES.mp4)).type.kind).toBe("video")
  })

  it("checks both halves of a RIFF container", () => {
    // `RIFF` alone is also a WAV and an AVI, neither of which is permitted.
    const wav = [...Buffer.from("RIFF"), 0x24, 0x00, 0x00, 0x00, ...Buffer.from("WAVE")]

    expect(upload(wav).ok).toBe(false)
  })
})

describe("what is refused", () => {
  it.each(Object.entries(HOSTILE))("refuses a %s", (_name, bytes) => {
    const result = upload(bytes, "logo.png")

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("unrecognised")
  })

  it("is not fooled by a name or an extension", () => {
    // The oldest upload attack there is: an executable called `logo.png`.
    expect(upload(HOSTILE.elf, "logo.png").ok).toBe(false)
    expect(upload(HOSTILE.shell, "photo.jpg").ok).toBe(false)
  })

  it("refuses an empty upload", () => {
    const result = upload([], "nothing.png")

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("empty")
  })

  it("refuses bytes too short to carry a signature", () => {
    // A truncated PNG header. Matching on a prefix would accept it.
    expect(upload([0x89, 0x50]).ok).toBe(false)
  })
})

describe("the name", () => {
  it("keeps a name somebody would recognise", () => {
    expect(accepted(upload(BYTES.png, "Hero banner 2x.png")).fileName).toBe("Hero banner 2x.png")
  })

  it("trims it", () => {
    expect(accepted(upload(BYTES.png, "  logo.png  ")).fileName).toBe("logo.png")
  })

  it.each([
    ["a traversal", "../../etc/passwd"],
    ["a posix path", "assets/logo.png"],
    ["a windows path", "C:\\Windows\\System32\\logo.png"],
    ["a bare dot", "."],
    ["a bare double dot", ".."],
    ["nothing at all", "   "],
    ["a NUL", "logo\u0000.png"],
    ["a newline, which would forge a log line", "logo\n2024-01-01 deleted everything.png"],
  ])("refuses %s", (_name, fileName) => {
    const result = upload(BYTES.png, fileName)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("unsafe-name")
  })

  it("refuses a name longer than the column holds", () => {
    expect(upload(BYTES.png, `${"a".repeat(256)}.png`).ok).toBe(false)
  })

  it("allows a leading dot, which is a name and not a path", () => {
    expect(accepted(upload(BYTES.png, ".hidden.png")).fileName).toBe(".hidden.png")
  })
})

describe("size", () => {
  function sized(kind: keyof typeof DEFAULT_LIMITS, head: readonly number[], over: number) {
    const bytes = new Uint8Array(DEFAULT_LIMITS[kind] + over)
    bytes.set(head, 0)

    return inspectUpload({ bytes, fileName: "file.bin" })
  }

  it("accepts a file exactly at the ceiling", () => {
    // The boundary itself, because `>` and `>=` are one character apart.
    expect(sized("image", BYTES.png, 0).ok).toBe(true)
  })

  it("refuses a file one byte over, and says what it passed", () => {
    const result = sized("image", BYTES.png, 1)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("too-large")
    expect(result.limit).toBe(DEFAULT_LIMITS.image)
  })

  it("measures each kind against its own ceiling", () => {
    // A font at the image ceiling is far too big; an image at the video
    // ceiling is too. One number for everything would be wrong both ways.
    const bytes = new Uint8Array(DEFAULT_LIMITS.font + 1)
    bytes.set(BYTES.woff2, 0)

    expect(inspectUpload({ bytes, fileName: "f.woff2" }).ok).toBe(false)
    expect(DEFAULT_LIMITS.video).toBeGreaterThan(DEFAULT_LIMITS.image)
  })

  it("takes an override, because the specification says configurable", () => {
    const bytes = new Uint8Array(2000)
    bytes.set(BYTES.png, 0)

    expect(inspectUpload({ bytes, fileName: "a.png" }).ok).toBe(true)
    expect(inspectUpload({ bytes, fileName: "a.png", limits: { image: 1000 } }).ok).toBe(false)
  })

  it("overrides one kind without disturbing another", () => {
    const bytes = new Uint8Array(2000)
    bytes.set(BYTES.woff2, 0)

    expect(inspectUpload({ bytes, fileName: "f.woff2", limits: { image: 1 } }).ok).toBe(true)
  })
})

describe("an SVG", () => {
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'

  function svg(text: string) {
    return inspectUpload({ bytes: new Uint8Array(Buffer.from(text)), fileName: "icon.svg" })
  }

  it("is recognised, and refused for want of a sanitizer", () => {
    const result = svg(SVG)

    expect(result.ok).toBe(false)
    if (result.ok) return

    // Not "unrecognised": the difference matters, because one of them is a
    // thing we intend to support and the other never will be.
    expect(result.reason).toBe("needs-sanitizing")
  })

  it.each([
    ["a declaration", `<?xml version="1.0"?>${SVG}`],
    ["a doctype", `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN">${SVG}`],
    ["leading whitespace", `\n\n  ${SVG}`],
    // Consumed by `TextDecoder` while decoding, not by anything here.
    ["a byte order mark", `\uFEFF${SVG}`],
    ["uppercase", SVG.toUpperCase()],
  ])("is still recognised with %s", (_name, text) => {
    const result = svg(text)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("needs-sanitizing")
  })

  it("reports an oversized one as oversized, not as unsanitized", () => {
    // The size it would have been refused for anyway, reported as the thing
    // that is actually wrong with it.
    const result = inspectUpload({
      bytes: new Uint8Array(Buffer.from(SVG.padEnd(DEFAULT_LIMITS.vector + 1, " "))),
      fileName: "icon.svg",
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("too-large")
  })

  it("does not claim a raster image is one", () => {
    // A PNG whose metadata contains `<svg`. It is a PNG because `looksLikeSvg`
    // reads only the head, not because of the order the checks run in.
    const bytes = new Uint8Array([...BYTES.png, ...Buffer.from("<svg>")])

    expect(accepted(inspectUpload({ bytes, fileName: "a.png" })).type.mimeType).toBe("image/png")
  })

  it("is decided from the head, however far in the markup appears", () => {
    /*
     * The protection, pinned directly. A file that becomes XML a kilobyte in
     * is not an SVG — and if this scan were widened to the whole file, every
     * raster image carrying a text chunk would start taking the SVG path.
     */
    const bytes = new Uint8Array(4096)
    bytes.set(BYTES.jpeg, 0)
    bytes.set(Buffer.from('<svg xmlns="x">'), 2048)

    expect(accepted(inspectUpload({ bytes, fileName: "p.jpg" })).type.kind).toBe("image")
  })

  it("does not treat arbitrary XML as an image it can draw", () => {
    // Generous on purpose: anything opening as XML goes down the SVG path,
    // where it will be sanitized, rather than being waved through as
    // unrecognised-but-harmless.
    const result = svg('<?xml version="1.0"?><note>hello</note>')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("needs-sanitizing")
  })
})

describe("the content hash", () => {
  it("is the sha256 of the bytes, as hex", () => {
    const bytes = new Uint8Array(BYTES.png)
    const expected = createHash("sha256").update(bytes).digest("hex")

    expect(contentHash(bytes)).toBe(expected)
    expect(accepted(upload(BYTES.png)).sha256).toBe(expected)
  })

  it("is the same for the same bytes under different names", () => {
    // What makes `(projectId, sha256)` a deduplication key: the same image
    // uploaded twice is stored once, whatever it was called either time.
    expect(accepted(upload(BYTES.png, "a.png")).sha256).toBe(
      accepted(upload(BYTES.png, "b.png")).sha256,
    )
  })

  it("differs for one changed byte", () => {
    const other = [...BYTES.png.slice(0, -1), 0x0e]

    expect(accepted(upload(BYTES.png)).sha256).not.toBe(accepted(upload(other)).sha256)
  })

  it("is 64 lowercase hex characters", () => {
    expect(accepted(upload(BYTES.png)).sha256).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe("what is recorded", () => {
  it("reports the size as the byte length, not as anything claimed", () => {
    const bytes = new Uint8Array(4096)
    bytes.set(BYTES.jpeg, 0)

    expect(accepted(inspectUpload({ bytes, fileName: "p.jpg" })).sizeBytes).toBe(4096)
  })

  it("takes no declared content type at all", () => {
    /*
     * The point of the signature check, as a fact about the type rather than a
     * comment: `InspectInput` has no field for a client-supplied media type,
     * so there is nothing for a later reader to believe.
     *
     * Asserted this way rather than with a `@ts-expect-error` on a cast. That
     * directive has to sit on the line that errors, and a formatter is free to
     * rewrap the expression out from under it — which it did, and the push
     * hook caught it.
     */
    type DeclaresMime = "mimeType" extends keyof InspectInput ? true : false

    const declaresMime: DeclaresMime = false

    expect(declaresMime).toBe(false)

    // And the type that is recorded is the one the bytes matched.
    const result = inspectUpload({ bytes: new Uint8Array(BYTES.png), fileName: "a.png" })

    expect(accepted(result).type.mimeType).toBe("image/png")
  })
})
