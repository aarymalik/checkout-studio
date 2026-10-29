import { authenticate, route, s3Store, storeUpload, uploadRefusalError } from "@checkout-studio/api"
import type { ObjectStore } from "@checkout-studio/api"
import { assetRepository } from "@checkout-studio/database"
import { DEFAULT_LIMITS, Errors } from "@checkout-studio/utils"

import { getEnv } from "@/env"

/**
 * A project's assets.
 *
 * The HTTP end of the pipeline, and deliberately thin: deciding what an upload
 * becomes belongs to `storeUpload`, which can be tested without a request.
 * What is here is the three things that are only true over HTTP — reading a
 * multipart body without buffering the whole internet, turning a refusal into
 * a status and a sentence, and the rate limit.
 */

/**
 * The largest body this will read, whatever it claims to be.
 *
 * `inspectUpload` has a ceiling per kind and cannot apply it until the bytes
 * are in hand, which is too late to be a defence: reading a form means
 * buffering it. So the largest configured ceiling is the cap on the request,
 * with a little room for the multipart framing around the file.
 */
const BODY_LIMIT = Math.max(...Object.values(DEFAULT_LIMITS)) + 100_000

function idOf(params: Record<string, string>): string {
  const id = params["projectId"]

  if (id === undefined || id === "") throw Errors.resource.notFound("Project")

  return id
}

function store(): ObjectStore {
  const env = getEnv()

  return s3Store({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    publicUrl: env.ASSET_BASE_URL,
  })
}

export const GET = route({ authenticate }, async ({ params, userId }) => {
  const assets = await assetRepository.list({ userId, projectId: idOf(params) })

  return { assets }
})

export const POST = route(
  {
    authenticate,
    /*
     * Per hour, and generous: a merchant setting up a store uploads in bursts.
     * It is here because the work behind one request is seconds of encoding,
     * which is a cost worth bounding even for somebody entitled to it.
     */
    rateLimit: { scope: "assets.upload", limit: 300, windowSeconds: 60 * 60 },
  },
  async ({ params, request, userId }) => {
    // First, because a request naming no project is going nowhere and there is
    // no reason to read a body for it.
    const projectId = idOf(params)

    const declared = Number(request.headers.get("content-length") ?? 0)

    /*
     * Refused on the claim, before the body is read. A client-supplied length
     * is not evidence of anything — but one that admits to being too large is
     * a request there is no reason to read, and the real size is checked from
     * the bytes either way.
     */
    if (declared > BODY_LIMIT) throw Errors.validation.fileTooLarge(declared, BODY_LIMIT)

    const form = await request.formData().catch(() => null)
    const file = form?.get("file")

    if (!(file instanceof File)) throw uploadRefusalError({ ok: false, reason: "empty" })

    const bytes = new Uint8Array(await file.arrayBuffer())

    if (bytes.length > BODY_LIMIT) throw Errors.validation.fileTooLarge(bytes.length, BODY_LIMIT)

    const result = await storeUpload({
      tenant: { userId, projectId },
      store: store(),
      bytes,
      fileName: file.name,
    })

    if (!result.ok) throw uploadRefusalError(result)

    return { asset: result.asset, deduplicated: result.deduplicated }
  },
)
