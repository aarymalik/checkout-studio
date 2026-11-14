import "server-only"

import type { IncomingHttpHeaders } from "node:http"
import { request } from "node:https"
import type { Readable } from "node:stream"
import type { LookupAddress } from "node:dns"
import { lookup as dnsLookup } from "node:dns"
import { contentHash } from "@checkout-studio/utils"

import { addressRefusal } from "./addresses"

/**
 * Fetching an asset a bundle points at.
 *
 * A JSON bundle carries URLs rather than bytes, so importing one means this
 * product making a request somebody else chose the target of. That is
 * server-side request forgery stated plainly, and the defences are layered
 * because each covers what the others cannot.
 *
 * ## The hash is the control that cannot be talked around
 *
 * The registry declares each asset's sha256, and bytes that do not hash to it
 * are discarded. An attacker who gets a request sent somewhere interesting
 * still cannot put anything into the library: whatever comes back is not what
 * the manifest said, so nothing is stored. Required rather than optional,
 * because a fetcher that could be called without it would eventually be.
 *
 * What the hash does *not* cover is the request itself — a GET that changes
 * something, or a reply whose timing says whether a host exists. So:
 *
 * ## The address is checked where the socket is opened
 *
 * `lookup` is handed to the connection rather than run beforehand. Resolving
 * a name, approving it, and then calling `fetch` leaves a window in which the
 * name resolves again to something else — DNS rebinding, and the second
 * answer is the one that gets connected to. Validating inside the lookup the
 * socket uses closes it, because the address this approves is the address it
 * returns.
 *
 * ## Redirects are refused rather than followed
 *
 * A permitted host answering 302 to `http://169.254.169.254/` would walk
 * around the check. Re-validating each hop is possible and is more machinery
 * than a bundle needs: an exporter writes a direct URL to its own CDN, and a
 * redirect is already a sign this is not that.
 *
 * ## The transport is a parameter
 *
 * So the plumbing — a timeout becoming a refusal, a socket error becoming a
 * refusal, a reply reaching `consume` — can be tested without standing up a
 * certificate authority. What a fake cannot test is Node's own TLS, which is
 * not ours to test; what it does test is every decision this file makes.
 *
 * ## HTTPS only
 *
 * Not a privacy nicety. Plain HTTP lets anything between here and there
 * substitute the bytes — and while the hash would catch that, the connection
 * would still have been made to wherever a network attacker steered it.
 */

export type FetchRefusal =
  | "blocked-scheme"
  | "blocked-address"
  | "redirected"
  | "too-large"
  | "hash-mismatch"
  | "unreachable"
  | "status"

export interface FetchedAsset {
  bytes: Uint8Array
  /** What the server said it was. Checked against the file's signature later. */
  contentType: string
}

export type FetchResult =
  { ok: true; asset: FetchedAsset } | { ok: false; reason: FetchRefusal; message: string }

export interface FetchLimits {
  /** The sha256 the registry declares. Bytes that do not match are discarded. */
  expectedSha256: string
  /** Refused past this, counted as it arrives rather than trusted from a header. */
  maxBytes: number
  timeoutMs: number
  /**
   * Which addresses may be connected to. Defaults to public ones only.
   *
   * Injected so a test can reach a server on the loopback it otherwise
   * refuses — and so the refusal itself can be tested as the pure rule it is.
   */
  allow?: (address: string) => string | null
}

/** What opens the connection. `https.request`, unless a test says otherwise. */
export type Transport = typeof request

export async function fetchAsset(
  url: string,
  limits: FetchLimits,
  open: Transport = request,
): Promise<FetchResult> {
  let parsed: URL

  try {
    parsed = new URL(url)
  } catch {
    return refuse("blocked-scheme", "This asset's address is not a URL.")
  }

  if (parsed.protocol !== "https:") {
    return refuse("blocked-scheme", `Assets are fetched over HTTPS; this one is ${parsed.protocol}`)
  }

  const allow = limits.allow ?? addressRefusal

  return new Promise<FetchResult>((resolve) => {
    let settled = false

    const done = (result: FetchResult): void => {
      if (settled) return

      settled = true
      resolve(result)
    }

    const call = open(
      parsed,
      {
        method: "GET",
        timeout: limits.timeoutMs,
        lookup: guardedLookup(allow, done),
      },
      (response) => {
        void consume(response, response.statusCode ?? 0, headerType(response.headers), limits).then(
          done,
        )
      },
    )

    call.on("timeout", () => {
      call.destroy()
      done(refuse("unreachable", "Fetching this asset took too long."))
    })

    call.on("error", () => {
      done(refuse("unreachable", "This asset could not be fetched."))
    })

    call.end()
  })
}

/**
 * What a reply amounts to, separated from how it arrived.
 *
 * Everything decided here is decided on bytes and a status, so it is tested
 * on a stream rather than on a socket. A test that had to stand up TLS to
 * find out whether a size cap works would be testing Node's certificate
 * handling and calling it a size cap.
 */
export async function consume(
  response: Readable,
  status: number,
  contentType: string,
  limits: FetchLimits,
): Promise<FetchResult> {
  if (status >= 300 && status < 400) {
    response.destroy()

    return refuse("redirected", "This asset's address redirects, which an import does not follow.")
  }

  if (status !== 200) {
    response.destroy()

    return refuse("status", `Fetching this asset answered ${String(status)}.`)
  }

  const chunks: Buffer[] = []
  let received = 0

  try {
    for await (const chunk of response as AsyncIterable<Buffer>) {
      received += chunk.length

      /*
       * Counted as it arrives rather than read off a header. A declared
       * length is a claim by the same party that chose the URL, and a
       * response that keeps going is the attack a cap exists for.
       */
      if (received > limits.maxBytes) {
        response.destroy()

        return refuse("too-large", "This asset is larger than the bundle declared.")
      }

      chunks.push(chunk)
    }
  } catch {
    return refuse("unreachable", "This asset could not be read.")
  }

  const bytes = new Uint8Array(Buffer.concat(chunks))

  if (contentHash(bytes) !== limits.expectedSha256) {
    return refuse("hash-mismatch", "This asset's contents are not what the bundle described.")
  }

  return { ok: true, asset: { bytes, contentType } }
}

function headerType(headers: IncomingHttpHeaders): string {
  return headers["content-type"] ?? "application/octet-stream"
}

/**
 * The lookup the socket uses, which is the only one worth checking.
 *
 * Every address a name resolves to has to pass. A name answering with one
 * public address and one loopback address is a rebinding attempt written in
 * advance, and connecting to whichever came first would be luck rather than
 * policy.
 */
function guardedLookup(
  allow: (address: string) => string | null,
  done: (result: FetchResult) => void,
): (
  hostname: string,
  options: unknown,
  callback: (error: Error | null, address: string | LookupAddress[], family?: number) => void,
) => void {
  return (hostname, options, callback) => {
    dnsLookup(hostname, { all: true }, (error, addresses) => {
      if (error !== null) {
        done(refuse("unreachable", "This asset's host could not be found."))

        return callback(error, [])
      }

      const why = firstRefusal(
        addresses.map((entry) => entry.address),
        allow,
      )

      if (why !== null) {
        done(refuse("blocked-address", `This asset is hosted on a ${why} address.`))

        return callback(new Error("refused"), [])
      }

      callback(null, addresses)
    })
  }
}

/**
 * The first reason any of a name's addresses is refused, or null if none is.
 *
 * Every address has to pass, not the one that happened to come back first. A
 * name answering with one public address and one loopback address is a
 * rebinding attempt written in advance, and connecting to whichever was
 * listed first would be luck rather than policy.
 */
export function firstRefusal(
  addresses: readonly string[],
  allow: (address: string) => string | null,
): string | null {
  for (const address of addresses) {
    const why = allow(address)

    if (why !== null) return why
  }

  return null
}

function refuse(reason: FetchRefusal, message: string): FetchResult {
  return { ok: false, reason, message }
}
