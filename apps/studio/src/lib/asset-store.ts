import "server-only"

import { join } from "node:path"

import { fileStore, s3Store } from "@checkout-studio/api"
import type { ObjectStore } from "@checkout-studio/api"

import { getEnv } from "@/env"

/**
 * Where this installation's asset bytes go.
 *
 * ## Two stores, one decision, made once
 *
 * S3 when the environment describes a bucket, and the filesystem when it does
 * not. The environment refuses to start in production without the five
 * variables, so "not configured" means somebody is building — and the point
 * of the filesystem store is that building does not require Docker.
 *
 * ## Why the five are checked one at a time
 *
 * A partially configured bucket is a real state: somebody sets three of them
 * and wonders why uploads go to disk. Checking each one lets the type say
 * what the schema cannot — that these five travel together — and the
 * alternative, asserting after checking one, is the sort of cast that is
 * right until the day the schema changes.
 */
export function assetStore(): ObjectStore {
  const env = getEnv()

  if (
    env.S3_ENDPOINT !== undefined &&
    env.S3_REGION !== undefined &&
    env.S3_BUCKET !== undefined &&
    env.S3_ACCESS_KEY_ID !== undefined &&
    env.S3_SECRET_ACCESS_KEY !== undefined
  ) {
    return s3Store({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      publicUrl: env.ASSET_BASE_URL,
    })
  }

  /*
   * `public`, so Next serves what was written with no route of ours in the
   * way — which is also the whole of the security argument. A route reading
   * files from a path a request named would be a path traversal waiting to
   * be written correctly; static serving of a directory has no such surface.
   *
   * The keys already begin with `assets/`, so `ASSET_BASE_URL` is the
   * application's own origin and nothing more.
   */
  return fileStore({ root: join(process.cwd(), "public"), publicUrl: env.ASSET_BASE_URL })
}
