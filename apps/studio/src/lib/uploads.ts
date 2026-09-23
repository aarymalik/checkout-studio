import { Errors } from "@checkout-studio/utils"

/**
 * The upload boundary.
 *
 * Limits and permitted types come from docs/security.md. This is the contract
 * every upload passes through; the storage provider's SDK is wired to it in
 * Phase 14, when the asset pipeline (optimisation, deduplication, the media
 * library) is actually built.
 *
 * The SDK is deliberately not installed yet: `uploadthing@7.7.4` pins
 * `effect@3.17.7`, which carries a high-severity advisory for
 * AsyncLocalStorage contamination under concurrent load — the mechanism our
 * correlation context depends on. A dependency we do not yet use is not worth
 * that, and Phase 14 can adopt whatever version is current then.
 */

export const MAX_UPLOAD_BYTES = {
  image: 8_000_000,
  video: 64_000_000,
  pdf: 16_000_000,
  font: 2_000_000,
} as const

export type UploadKind = keyof typeof MAX_UPLOAD_BYTES

/** Executables are refused outright; SVG is accepted only after sanitisation. */
export const ALLOWED_MIME_TYPES: Readonly<Record<UploadKind, readonly string[]>> = {
  image: ["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif", "image/svg+xml"],
  video: ["video/mp4", "video/webm"],
  pdf: ["application/pdf"],
  font: ["font/woff2", "font/woff"],
}

export type UploadContext = {
  userId: string
  projectId: string
}

export interface UploadRequest {
  kind: UploadKind
  mimeType: string
  sizeBytes: number
}

export function kindForMimeType(mimeType: string): UploadKind | undefined {
  return (Object.keys(ALLOWED_MIME_TYPES) as UploadKind[]).find((kind) =>
    ALLOWED_MIME_TYPES[kind].includes(mimeType),
  )
}

/**
 * Validates an upload before a byte is accepted.
 *
 * An unauthenticated or unscoped upload endpoint is an open file host, so a
 * missing project is refused here rather than deeper in the pipeline.
 */
export function assertUploadAllowed(request: UploadRequest, context: UploadContext): void {
  if (!context.projectId) {
    throw Errors.auth.forbidden("an upload must name a project")
  }

  const kind = kindForMimeType(request.mimeType)

  if (!kind || kind !== request.kind) {
    throw Errors.validation.invalidFileType(request.mimeType, ALLOWED_MIME_TYPES[request.kind])
  }

  const limit = MAX_UPLOAD_BYTES[kind]

  if (request.sizeBytes > limit) {
    throw Errors.validation.fileTooLarge(request.sizeBytes, limit)
  }
}
