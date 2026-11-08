import "server-only"

import { mkdir, rm, writeFile } from "node:fs/promises"
import { dirname, resolve, sep } from "node:path"

import { contentHash } from "@checkout-studio/utils"
import { AwsClient } from "aws4fetch"

import { publicUrl } from "./keys"

/**
 * Where an asset's bytes go.
 *
 * ## S3's API, and not a vendor's
 *
 * docs/deployment.md named a managed uploads product. This speaks S3 instead,
 * which is not the same decision as choosing Amazon: S3's API is the one
 * protocol every self-hostable object store implements — MinIO, Garage,
 * SeaweedFS — and every hosted one too. So where the bucket runs is four
 * environment variables rather than a line of code, and self-hosting the asset
 * pipeline stays available in the way self-hosting authentication already is.
 *
 * Spoken over `fetch`, for the reason `auth/email.ts` gives about Resend: a
 * dependency that wraps a handful of HTTP requests is a dependency to keep up
 * to date. The one exception is the signing, which is an HMAC chain whose
 * mistakes do not show up in its output — `aws4fetch` is five kilobytes with
 * no dependencies of its own and does exactly that.
 *
 * ## Path style
 *
 * The bucket is in the path and not the hostname. Virtual-host style needs
 * wildcard DNS and a certificate per bucket, which is reasonable for a managed
 * service and unreasonable for a container somebody runs themselves. Path
 * style works everywhere, including against the HTTP server these tests stand
 * up.
 *
 * ## What the signature has to cover
 *
 * Two things `aws4fetch` does not do unaided, and both matter here.
 *
 * The payload hash is set rather than left as `UNSIGNED-PAYLOAD`, so the
 * signature binds the request to these exact bytes. Over TLS nothing is likely
 * to change them in flight; a signature that covers them means nothing *can*,
 * including a retry that sends something else.
 *
 * And every header is signed, not the default few. An unsigned `content-type`
 * is a content type something in the middle may rewrite — and an image stored
 * as `text/html` and later served from our own origin is the stored
 * cross-site-scripting hole this whole pipeline exists to close.
 *
 * ## Retried a few times, not for a minute
 *
 * `aws4fetch` retries a 500 or a 429 ten times by default, starting at fifty
 * milliseconds and doubling — which comes to about fifty seconds. Inside a web
 * request that is not resilience: the merchant's upload hangs until something
 * else times out, and they are told nothing. Three attempts over a few hundred
 * milliseconds covers the blip that retrying is for. A store having a bad
 * minute should surface as a failure the caller can report, and be retried by
 * something that is not holding a request open.
 *
 * ## Writing the same key twice is the point
 *
 * A key is derived from the content hash, so two uploads of one picture write
 * the same object with the same bytes. Nothing checks whether a key exists
 * first: the check would cost a request to learn that the following request is
 * harmless.
 *
 * See docs/security.md § File Upload Security and docs/phases.md Phase 14.
 */

export interface StoredObject {
  /** From `masterKey` or `renditionKey`. A hash, never a filename. */
  key: string
  bytes: Uint8Array
  /** The type the signature matched, which is what it will be served as. */
  contentType: string
}

export interface ObjectStore {
  put: (object: StoredObject) => Promise<void>
  remove: (key: string) => Promise<void>
  /** Where the object is served from. A pure function of the key. */
  url: (key: string) => string
}

export interface S3Config {
  /** The store's base URL. No bucket — this is path style. */
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  /** What assets are served from: a CDN, or the bucket itself. */
  publicUrl: string
}

/**
 * Immutable, because the key names the content.
 *
 * A year, and `immutable` so a browser does not revalidate. This is only safe
 * because a different picture is a different key — which is the same property
 * deduplication rests on, spent twice.
 */
const CACHE_CONTROL = "public, max-age=31536000, immutable"

/** Attempts after the first. Three in total, which is a blip's worth. */
const RETRIES = 2

/** Doubling from here, so the attempts fall at 0ms, 100ms and 300ms. */
const RETRY_BACKOFF_MS = 100

/** A delete carries no body, and the hash of no bytes is still a hash. */
const EMPTY_HASH = contentHash(new Uint8Array())

export function s3Store(config: S3Config): ObjectStore {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
    service: "s3",
    retries: RETRIES,
    initRetryMs: RETRY_BACKOFF_MS,
  })

  const object = (key: string): string => publicUrl(publicUrl(config.endpoint, config.bucket), key)

  return {
    async put(stored) {
      const response = await client.fetch(object(stored.key), {
        method: "PUT",
        headers: {
          "content-type": stored.contentType,
          "cache-control": CACHE_CONTROL,
          "x-amz-content-sha256": contentHash(stored.bytes),
        },
        aws: { allHeaders: true },
        /*
         * Copied, because a request body may not be a view over a buffer that
         * might be shared and the type cannot tell that ours never is. One
         * memcpy, on a path that has already decoded and re-encoded a picture.
         */
        body: new Uint8Array(stored.bytes),
      })

      await refuse(response, "store", stored.key)
    },

    async remove(key) {
      const response = await client.fetch(object(key), {
        method: "DELETE",
        headers: { "x-amz-content-sha256": EMPTY_HASH },
        aws: { allHeaders: true },
      })

      /*
       * 404 is success. Removing an object that is not there leaves the world
       * in the state the caller asked for, and a delete that has to be retried
       * should not fail the second time.
       */
      if (response.status === 404) return

      await refuse(response, "remove", key)
    },

    url(key) {
      return publicUrl(config.publicUrl, key)
    },
  }
}

/**
 * Turns a refusal into an error that says which object and why.
 *
 * The body is included, clipped: S3 answers with an XML document naming a code
 * like `SignatureDoesNotMatch` or `NoSuchBucket`, and that is the difference
 * between an afternoon and a minute. It carries no credential — the signature
 * travels in a request header, and a response does not echo it.
 *
 * Reading it is not guarded. A connection that breaks before the body arrives
 * makes `fetch` itself reject, so there is no path where a response is in hand
 * and unreadable, and a guard against one would be a second answer to a
 * question nothing asks.
 */
async function refuse(response: Response, verb: string, key: string): Promise<void> {
  if (response.ok) return

  const body = await response.text()

  throw new Error(
    `Could not ${verb} ${key}: the object store answered ${response.status}. ${body.slice(0, 300)}`.trim(),
  )
}

export interface FileConfig {
  /** The directory objects are written under. */
  root: string
  /** What a browser fetches them from. The key is appended to it. */
  publicUrl: string
}

/**
 * Object storage on the filesystem, for development.
 *
 * ## Why this exists
 *
 * The S3 API is what every self-hostable object store speaks, which is why
 * `s3Store` is the real one — but it still means a bucket, and a bucket
 * locally means Docker. A fresh clone could not accept a single upload until
 * somebody had MinIO running, and dragging a picture into the media library
 * is the first thing anybody does with it.
 *
 * ## Development only
 *
 * Nothing here replicates, expires, signs or survives a deploy. The
 * environment refuses to start in production without the five S3 variables,
 * so this is only reachable where losing the files costs a re-upload.
 *
 * ## A key cannot escape the root
 *
 * Keys are derived from a content hash and never from a filename, so a
 * traversing key is not something this can be handed today. The check is here
 * because "today" is doing a lot of work in that sentence, and because the
 * cost of being wrong is writing wherever the process can write.
 */
export function fileStore(config: FileConfig): ObjectStore {
  return {
    async put(object) {
      const target = pathFor(config.root, object.key)

      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, object.bytes)
    },

    async remove(key) {
      // `force`, because removing what is not there is the outcome asked for.
      await rm(pathFor(config.root, key), { force: true })
    },

    url(key) {
      return publicUrl(config.publicUrl, key)
    },
  }
}

function pathFor(root: string, key: string): string {
  const base = resolve(root)
  const target = resolve(base, key)

  if (target !== base && !target.startsWith(base + sep)) {
    throw new Error(`"${key}" is not a key this store will write.`)
  }

  return target
}

/**
 * Keeps objects in memory instead of sending them.
 *
 * For tests that are about what gets stored rather than about storing it — the
 * upload pipeline's, above all, where the interesting part is which keys and
 * which bytes and not whether a socket worked.
 */
export function recordingStore(base = "https://assets.test"): ObjectStore & {
  objects: Map<string, StoredObject>
} {
  const objects = new Map<string, StoredObject>()

  return {
    objects,

    async put(stored) {
      objects.set(stored.key, stored)
    },

    async remove(key) {
      objects.delete(key)
    },

    url(key) {
      return publicUrl(base, key)
    },
  }
}
