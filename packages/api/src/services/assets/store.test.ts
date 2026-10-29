import { createServer, type IncomingMessage, type Server } from "node:http"
import type { AddressInfo } from "node:net"

import { contentHash } from "@checkout-studio/utils"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { recordingStore, s3Store } from "./store"
import type { ObjectStore } from "./store"

/**
 * Where an asset's bytes go.
 *
 * ## Tested over a socket, against a server standing in for S3
 *
 * Not against a signature written down here. The signing is `aws4fetch`'s job
 * and is covered by its own tests; what this has to prove is that the adapter
 * calls it correctly — the method, the path, the headers, the body that
 * arrives, and what happens when the store says no. Comparing a string to one
 * I typed out would prove the string.
 *
 * The repo already runs its database and cache tests against real servers, for
 * the same reason.
 */

interface Received {
  method: string
  url: string
  headers: IncomingMessage["headers"]
  body: Buffer
}

let server: Server
let endpoint: string
let received: Received[] = []
interface Answer {
  status: number
  body: string
}

/** What the next request is answered with. */
let answer: Answer = { status: 200, body: "" }

/** Answers for the first requests, in order, before `answer` takes over. */
let scripted: Answer[] = []

beforeAll(async () => {
  server = createServer((request, response) => {
    const chunks: Buffer[] = []

    request.on("data", (chunk: Buffer) => chunks.push(chunk))
    request.on("end", () => {
      received.push({
        method: request.method ?? "",
        url: request.url ?? "",
        headers: request.headers,
        body: Buffer.concat(chunks),
      })

      const next = scripted.shift() ?? answer

      response.writeHead(next.status, { "content-type": "application/xml" })
      response.end(next.body)
    })
  })

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))

  const { port } = server.address() as AddressInfo
  endpoint = `http://127.0.0.1:${port}`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
})

beforeEach(() => {
  received = []
  scripted = []
  answer = { status: 200, body: "" }
})

function store(): ObjectStore {
  return s3Store({
    endpoint,
    region: "us-east-1",
    bucket: "checkout-assets",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    publicUrl: "https://assets.example.test",
  })
}

const KEY = `assets/${"9f2a4c8e".repeat(8)}.png`
const BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

function only(): Received {
  expect(received).toHaveLength(1)

  const request = received[0]

  if (request === undefined) throw new Error("no request arrived")

  return request
}

describe("storing an object", () => {
  it("puts it at the bucket and key, path style", async () => {
    await store().put({ key: KEY, bytes: BYTES, contentType: "image/png" })

    const request = only()

    expect(request.method).toBe("PUT")
    expect(request.url).toBe(`/checkout-assets/${KEY}`)
  })

  it("sends the bytes unchanged", async () => {
    await store().put({ key: KEY, bytes: BYTES, contentType: "image/png" })

    expect(only().body.equals(Buffer.from(BYTES))).toBe(true)
  })

  it("sends the type it will be served as", async () => {
    // Which is the one the signature matched, never the one a request claimed.
    await store().put({ key: KEY, bytes: BYTES, contentType: "image/png" })

    expect(only().headers["content-type"]).toBe("image/png")
  })

  it("marks it immutable, because the key names the content", async () => {
    await store().put({ key: KEY, bytes: BYTES, contentType: "image/png" })

    expect(only().headers["cache-control"]).toBe("public, max-age=31536000, immutable")
  })

  it("signs the request", async () => {
    /*
     * The adapter's part of signing, not the algorithm's: a signature over
     * this account and region arrives, and it covers a payload hash rather
     * than announcing the body unsigned.
     */
    await store().put({ key: KEY, bytes: BYTES, contentType: "image/png" })

    const request = only()
    const authorization = String(request.headers["authorization"])

    expect(authorization).toContain("AWS4-HMAC-SHA256")
    expect(authorization).toContain("AKIAIOSFODNN7EXAMPLE")
    expect(authorization).toContain("/us-east-1/s3/aws4_request")
    expect(request.headers["x-amz-date"]).toMatch(/^\d{8}T\d{6}Z$/)
  })

  it("binds the signature to these exact bytes", async () => {
    /*
     * `aws4fetch` leaves the payload unsigned for S3 unless told otherwise.
     * Over TLS nothing is likely to alter the body in flight; a hash in the
     * signature means nothing can, including a retry that sends something else.
     */
    await store().put({ key: KEY, bytes: BYTES, contentType: "image/png" })

    expect(only().headers["x-amz-content-sha256"]).toBe(contentHash(BYTES))
  })

  it("covers every header the object is stored with", async () => {
    /*
     * An unsigned `content-type` is a content type something in the middle may
     * rewrite — and an image stored as `text/html` and later served from our
     * own origin is the stored cross-site-scripting hole this pipeline exists
     * to close.
     */
    await store().put({ key: KEY, bytes: BYTES, contentType: "image/png" })

    const authorization = String(only().headers["authorization"])
    const signed = /SignedHeaders=([^,]+)/.exec(authorization)?.[1]?.split(";") ?? []

    expect(signed).toContain("content-type")
    expect(signed).toContain("cache-control")
    expect(signed).toContain("host")
    expect(signed).toContain("x-amz-content-sha256")
  })

  it("carries no secret, only a signature over one", async () => {
    await store().put({ key: KEY, bytes: BYTES, contentType: "image/png" })

    const headers = JSON.stringify(only().headers)

    expect(headers).not.toContain("wJalrXUtnFEMI")
  })

  it("writes the same key twice without complaint", async () => {
    // Two uploads of one picture derive one key and send the same bytes. The
    // second write landing on itself is the design, not a collision.
    const subject = store()

    await subject.put({ key: KEY, bytes: BYTES, contentType: "image/png" })
    await subject.put({ key: KEY, bytes: BYTES, contentType: "image/png" })

    expect(received).toHaveLength(2)
    expect(received[0]?.url).toBe(received[1]?.url)
  })
})

describe("a store that says no", () => {
  it("says which object and what it answered", async () => {
    answer = {
      status: 403,
      body: "<Error><Code>SignatureDoesNotMatch</Code></Error>",
    }

    await expect(store().put({ key: KEY, bytes: BYTES, contentType: "image/png" })).rejects.toThrow(
      /Could not store assets\/9f2a.*403.*SignatureDoesNotMatch/s,
    )
  })

  it("clips the answer, in case it is a document and not a sentence", async () => {
    answer = { status: 400, body: "x".repeat(5_000) }

    const failure = await store()
      .put({ key: KEY, bytes: BYTES, contentType: "image/png" })
      .catch((error: unknown) => error)

    expect(String(failure).length).toBeLessThan(500)
  })

  it("repeats nothing a credential could be read from", async () => {
    answer = { status: 403, body: "<Error><Code>AccessDenied</Code></Error>" }

    const failure = await store()
      .put({ key: KEY, bytes: BYTES, contentType: "image/png" })
      .catch((error: unknown) => error)

    expect(String(failure)).not.toContain("wJalrXUtnFEMI")
  })
})

describe("a store having a bad moment", () => {
  it("tries again, and succeeds when the next attempt does", async () => {
    scripted = [{ status: 503, body: "<Error><Code>SlowDown</Code></Error>" }]

    await expect(
      store().put({ key: KEY, bytes: BYTES, contentType: "image/png" }),
    ).resolves.toBeUndefined()

    expect(received).toHaveLength(2)
  })

  it("gives up after three attempts rather than holding the request open", async () => {
    /*
     * `aws4fetch` would retry a 500 ten times, doubling from fifty
     * milliseconds — about fifty seconds, during which the merchant is told
     * nothing and something else times out first. A store that is properly
     * unwell should be reported, and retried by something not holding a
     * request open.
     */
    answer = { status: 500, body: "<Error><Code>InternalError</Code></Error>" }

    await expect(store().put({ key: KEY, bytes: BYTES, contentType: "image/png" })).rejects.toThrow(
      /Could not store/,
    )

    expect(received).toHaveLength(3)
  })

  it("does not try again on a refusal trying again cannot fix", async () => {
    // A bad signature or a missing bucket is not a blip, and three requests
    // to learn it twice over is two requests wasted.
    answer = { status: 403, body: "<Error><Code>SignatureDoesNotMatch</Code></Error>" }

    await expect(store().put({ key: KEY, bytes: BYTES, contentType: "image/png" })).rejects.toThrow(
      /403/,
    )

    expect(received).toHaveLength(1)
  })
})

describe("removing an object", () => {
  it("deletes it at its key", async () => {
    await store().remove(KEY)

    const request = only()

    expect(request.method).toBe("DELETE")
    expect(request.url).toBe(`/checkout-assets/${KEY}`)
  })

  it("treats one that is not there as removed", async () => {
    /*
     * The caller asked for the object to be gone and it is. A delete that has
     * to be retried — a job, a cleanup after a failed upload — must not fail
     * the second time.
     */
    answer = { status: 404, body: "<Error><Code>NoSuchKey</Code></Error>" }

    await expect(store().remove(KEY)).resolves.toBeUndefined()
  })

  it("signs the empty payload rather than announcing it unsigned", async () => {
    await store().remove(KEY)

    const request = only()

    expect(request.headers["x-amz-content-sha256"]).toBe(contentHash(new Uint8Array()))
    expect(String(request.headers["authorization"])).toContain("x-amz-content-sha256")
  })

  it("still fails on a refusal that is not absence", async () => {
    answer = { status: 403, body: "<Error><Code>AccessDenied</Code></Error>" }

    await expect(store().remove(KEY)).rejects.toThrow(/Could not remove/)
  })
})

describe("where an object is served from", () => {
  it("is the public base and the key, not the bucket's own host", async () => {
    // The bucket may not be reachable from a browser at all, and an asset's
    // URL is a CDN's business rather than the store's.
    expect(store().url(KEY)).toBe(`https://assets.example.test/${KEY}`)
  })

  it("does not double a separator, whatever it is given", async () => {
    const subject = s3Store({
      endpoint: `${endpoint}/`,
      region: "us-east-1",
      bucket: "checkout-assets",
      accessKeyId: "key",
      secretAccessKey: "secret",
      publicUrl: "https://assets.example.test/",
    })

    expect(subject.url(`/${KEY}`)).toBe(`https://assets.example.test/${KEY}`)

    await subject.put({ key: KEY, bytes: BYTES, contentType: "image/png" })

    expect(only().url).toBe(`/checkout-assets/${KEY}`)
  })
})

describe("the recording store", () => {
  it("keeps what it was given instead of sending it", async () => {
    const subject = recordingStore()

    await subject.put({ key: KEY, bytes: BYTES, contentType: "image/png" })

    expect(subject.objects.get(KEY)).toEqual({
      key: KEY,
      bytes: BYTES,
      contentType: "image/png",
    })
    expect(received).toEqual([])
  })

  it("forgets what it removes, and shrugs at what it never had", async () => {
    const subject = recordingStore()

    await subject.put({ key: KEY, bytes: BYTES, contentType: "image/png" })
    await subject.remove(KEY)
    await subject.remove("assets/never.png")

    expect(subject.objects.size).toBe(0)
  })

  it("answers the same shape of URL the real one does", async () => {
    expect(recordingStore("https://assets.test").url(KEY)).toBe(`https://assets.test/${KEY}`)
  })
})
