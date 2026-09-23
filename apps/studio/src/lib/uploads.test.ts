import { describe, expect, it } from "vitest"
import { type AppError } from "@checkout-studio/utils"
import { assertUploadAllowed, kindForMimeType, MAX_UPLOAD_BYTES } from "./uploads"

/** Errors carry a code and two messages; assert on the code, not on prose. */
function codeOf(run: () => void): string {
  try {
    run()
  } catch (error) {
    return (error as AppError).code
  }
  return "NO_ERROR"
}

const context = { userId: "user_1", projectId: "proj_1" }

describe("upload boundary", () => {
  it("accepts a permitted image within the size limit", () => {
    expect(() =>
      assertUploadAllowed({ kind: "image", mimeType: "image/png", sizeBytes: 1_000 }, context),
    ).not.toThrow()
  })

  it("refuses an upload that does not name a project", () => {
    expect(() =>
      assertUploadAllowed(
        { kind: "image", mimeType: "image/png", sizeBytes: 1 },
        {
          userId: "user_1",
          projectId: "",
        },
      ),
    ).toThrow(/must name a project/)
  })

  it("refuses an executable", () => {
    expect(
      codeOf(() =>
        assertUploadAllowed(
          { kind: "image", mimeType: "application/x-mach-binary", sizeBytes: 10 },
          context,
        ),
      ),
    ).toBe("INVALID_FILE_TYPE")
  })

  it("refuses a file that exceeds its kind's limit", () => {
    expect(
      codeOf(() =>
        assertUploadAllowed(
          { kind: "image", mimeType: "image/png", sizeBytes: MAX_UPLOAD_BYTES.image + 1 },
          context,
        ),
      ),
    ).toBe("FILE_TOO_LARGE")
  })

  it("refuses a type that belongs to a different kind", () => {
    expect(() =>
      assertUploadAllowed({ kind: "image", mimeType: "application/pdf", sizeBytes: 10 }, context),
    ).toThrow()
  })

  it("maps mime types to their kind", () => {
    expect(kindForMimeType("image/webp")).toBe("image")
    expect(kindForMimeType("video/mp4")).toBe("video")
    expect(kindForMimeType("application/zip")).toBeUndefined()
  })
})
