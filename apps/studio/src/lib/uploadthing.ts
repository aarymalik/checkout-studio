import { createUploadthing, type FileRouter } from "uploadthing/next"
import { Errors } from "@checkout-studio/utils"

/**
 * Upload configuration.
 *
 * Limits and permitted types come from docs/security.md. The asset pipeline
 * itself — optimisation, deduplication, the media library — is Phase 14; this
 * establishes the boundary so nothing can upload without passing it.
 *
 * Every upload is authenticated and scoped to a project the caller owns: an
 * unauthenticated upload endpoint is an open file host.
 */
const f = createUploadthing()

/**
 * A type alias, not an interface: UploadThing's middleware must return
 * something assignable to a type with an index signature, and TypeScript only
 * grants implicit index signatures to type aliases.
 */
export type UploadContext = {
  userId: string
  projectId: string
}

/** Injected by the route so this module stays testable and free of Clerk. */
export type UploadAuthorizer = (request: Request) => Promise<UploadContext>

export function createFileRouter(authorize: UploadAuthorizer) {
  return {
    asset: f({
      image: { maxFileSize: "8MB", maxFileCount: 20 },
      video: { maxFileSize: "64MB", maxFileCount: 5 },
      pdf: { maxFileSize: "16MB", maxFileCount: 10 },
    })
      .middleware(async ({ req }) => {
        const context = await authorize(req)
        if (!context.projectId) throw Errors.auth.forbidden("an upload must name a project")
        return context
      })
      .onUploadComplete(async ({ metadata, file }) => {
        // Phase 14 records the Asset row, deduplicates by content hash, and
        // generates optimised variants. Returning the key keeps the client
        // contract stable until then.
        return { storageKey: file.key, projectId: String(metadata["projectId"]) }
      }),
  } satisfies FileRouter
}

export type AssetFileRouter = ReturnType<typeof createFileRouter>
