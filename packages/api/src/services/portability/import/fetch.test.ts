import { describe, expect, it } from "vitest"
import { EventEmitter } from "node:events"
import type { IncomingMessage } from "node:http"
import type { LookupFunction } from "node:net"
import { Readable } from "node:stream"
import { contentHash } from "@checkout-studio/utils"

import { addressRefusal, isPublicAddress } from "./addresses"
import { consume, fetchAsset, firstRefusal } from "./fetch"
import type { FetchLimits, Transport } from "./fetch"

/**
 * Fetching an asset a stranger's file told us to fetch.
 *
 * Server-side request forgery, stated plainly: the danger is not what comes
 * back but where the request goes. So most of these are about requests that
 * must never be made, and the rest about bytes that must never be kept.
 */

const BYTES = new Uint8Array([1, 2, 3, 4])
const HASH = contentHash(BYTES)

function limits(over: Partial<FetchLimits> = {}): FetchLimits {
  return { expectedSha256: HASH, maxBytes: 1_000, timeoutMs: 1_000, ...over }
}

describe("where a request may go", () => {
  it.each([
    ["169.254.169.254", "the cloud metadata endpoint"],
    ["127.0.0.1", "loopback"],
    ["10.1.2.3", "a private network"],
    ["172.16.0.1", "a private network"],
    ["172.31.255.255", "the top of that private network"],
    ["192.168.1.1", "a home network"],
    ["100.64.0.1", "carrier-grade NAT"],
    ["0.0.0.0", "this network"],
    ["224.0.0.1", "multicast"],
    ["240.0.0.1", "reserved"],
    ["198.18.0.1", "benchmarking"],
  ])("refuses %s — %s", (address) => {
    expect(isPublicAddress(address)).toBe(false)
  })

  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "11.0.0.1"])(
    "allows the public address %s",
    (address) => {
      // The ranges next door to a blocked one are the ones a mask gets wrong.
      expect(isPublicAddress(address)).toBe(true)
    },
  )

  it.each([
    ["::1", "loopback"],
    ["::", "unspecified"],
    ["fe80::1", "link local"],
    ["fc00::1", "unique local"],
    ["fd12:3456::1", "unique local"],
    ["ff02::1", "multicast"],
    ["2001:db8::1", "documentation"],
  ])("refuses the v6 address %s — %s", (address) => {
    expect(isPublicAddress(address)).toBe(false)
  })

  it("allows a public v6 address", () => {
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true)
  })

  it("sees through an IPv4-mapped v6 address", () => {
    /*
     * `::ffff:127.0.0.1` is a loopback connection however it is spelled, and
     * a prefix check that only knew v6 shapes would wave it through.
     */
    expect(isPublicAddress("::ffff:127.0.0.1")).toBe(false)
    expect(isPublicAddress("::ffff:8.8.8.8")).toBe(true)
  })

  it("refuses anything that is not an address at all", () => {
    // Nothing should reach it — a lookup answers with addresses — and a
    // string we cannot classify has only one safe reading.
    expect(addressRefusal("localhost")).toBe("not an IP address")
  })

  it("says why, so a refusal can be explained", () => {
    expect(addressRefusal("169.254.169.254")).toContain("metadata")
  })
})

describe("the scheme", () => {
  it.each(["http://example.test/a.png", "file:///etc/passwd", "ftp://example.test/a.png"])(
    "refuses %s",
    async (url) => {
      /*
       * Plain HTTP would let anything in between substitute the bytes — the
       * hash would catch that, but the connection would still have been made
       * to wherever a network attacker steered it.
       */
      expect(await fetchAsset(url, limits())).toMatchObject({ reason: "blocked-scheme" })
    },
  )

  it("refuses something that is not a URL", async () => {
    expect(await fetchAsset("not a url", limits())).toMatchObject({ reason: "blocked-scheme" })
  })
})

describe("a host that resolves somewhere it should not", () => {
  it("is refused before anything is connected to", async () => {
    /*
     * `localhost` resolves to the loopback, and the check runs inside the
     * lookup the socket uses — so this never opens a connection, never
     * negotiates TLS, and never reaches a server. That is also why the test
     * needs no server.
     */
    const result = await fetchAsset("https://localhost:9/nothing.png", limits())

    expect(result).toMatchObject({ reason: "blocked-address" })
    expect(result.ok === false ? result.message : "").toContain("loopback")
  })

  it("is refused for a host that does not resolve at all", async () => {
    const result = await fetchAsset("https://nothing.invalid/a.png", limits())

    expect(result).toMatchObject({ ok: false })
  })
})

describe("what comes back", () => {
  const reply = (chunks: readonly Uint8Array[]): Readable =>
    Readable.from(chunks.map((chunk) => Buffer.from(chunk)))

  it("is kept when it is what the bundle described", async () => {
    const result = await consume(reply([BYTES]), 200, "image/png", limits())

    expect(result).toEqual({ ok: true, asset: { bytes: BYTES, contentType: "image/png" } })
  })

  it("is discarded when it is not", async () => {
    /*
     * The control that cannot be talked around. Someone who gets a request
     * sent somewhere interesting still puts nothing into the library,
     * because what came back is not what the manifest said.
     */
    const other = new Uint8Array([9, 9, 9])

    expect(await consume(reply([other]), 200, "image/png", limits())).toMatchObject({
      reason: "hash-mismatch",
    })
  })

  it("is refused past the size it was supposed to be", async () => {
    // Counted as it arrives. A declared length is a claim by the same party
    // that chose the URL.
    const big = [new Uint8Array(600), new Uint8Array(600)]

    expect(await consume(reply(big), 200, "image/png", limits({ maxBytes: 1_000 }))).toMatchObject({
      reason: "too-large",
    })
  })

  it("is refused when the server redirects", async () => {
    // A permitted host answering 302 to the metadata endpoint would walk
    // around every check above.
    expect(await consume(reply([BYTES]), 302, "text/html", limits())).toMatchObject({
      reason: "redirected",
    })
  })

  it.each([404, 403, 500])("is refused when the server answers %s", async (status) => {
    expect(await consume(reply([BYTES]), status, "text/html", limits())).toMatchObject({
      reason: "status",
    })
  })

  it("falls back to a type nothing will trust", async () => {
    // What a server claims is a hint. The bytes are sniffed before anything
    // is stored, which is what Phase 14's sanitizer is for.
    const result = await consume(reply([BYTES]), 200, "application/octet-stream", limits())

    expect(result.ok ? result.asset.contentType : "").toBe("application/octet-stream")
  })

  it("is refused when the stream breaks half way", async () => {
    const broken = new Readable({
      read() {
        this.destroy(new Error("connection reset"))
      },
    })

    expect(await consume(broken, 200, "image/png", limits())).toMatchObject({
      reason: "unreachable",
    })
  })
})

describe("a name with more than one address", () => {
  it("is refused when any of them is blocked, not just the first", () => {
    /*
     * One public address and one loopback is a rebinding attempt written in
     * advance. Checking whichever came back first would be luck rather than
     * policy, and the attacker picks the order.
     */
    expect(firstRefusal(["8.8.8.8", "127.0.0.1"], addressRefusal)).toBe("loopback")
    expect(firstRefusal(["127.0.0.1", "8.8.8.8"], addressRefusal)).toBe("loopback")
  })

  it("is allowed when every one of them is public", () => {
    expect(firstRefusal(["8.8.8.8", "1.1.1.1"], addressRefusal)).toBeNull()
  })

  it("is allowed when a name resolves to nothing it could object to", () => {
    expect(firstRefusal([], addressRefusal)).toBeNull()
  })
})

describe("the plumbing around a connection", () => {
  /**
   * Tested through a fake transport rather than a server.
   *
   * What a certificate authority would buy here is a test of Node's TLS,
   * which is not ours to test. What these cover is every decision this file
   * makes once a socket exists: a timeout becoming a refusal, an error
   * becoming a refusal, and a reply reaching the part that reads it.
   */

  interface FakeCall extends EventEmitter {
    end: () => void
    destroy: () => void
  }

  function transport(
    drive: (
      call: FakeCall,
      reply: (
        response: Readable & { statusCode?: number; headers: Record<string, string> },
      ) => void,
    ) => void,
  ): Transport {
    return ((
      url: URL,
      options: { lookup: LookupFunction },
      onResponse: (response: IncomingMessage) => void,
    ) => {
      const call = Object.assign(new EventEmitter(), {
        end: () => {
          /*
           * A real transport resolves the host before it connects, and the
           * guard lives inside that lookup. A fake that skipped it would
           * leave the check this file exists for untested.
           */
          options.lookup(url.hostname, { all: true }, (error) => {
            if (error !== null) return

            setTimeout(() => {
              drive(call as FakeCall, (response) => {
                onResponse(response as unknown as IncomingMessage)
              })
            }, 0)
          })
        },
        destroy: () => undefined,
      })

      return call as unknown as ReturnType<Transport>
    }) as unknown as Transport
  }

  function body(
    bytes: Uint8Array,
    status = 200,
  ): Readable & { statusCode: number; headers: Record<string, string> } {
    return Object.assign(Readable.from([Buffer.from(bytes)]), {
      statusCode: status,
      headers: { "content-type": "image/png" },
    })
  }

  /*
   * A name that resolves, so the lookup runs for real. Which address it
   * resolves to is the policy's business, and `anywhere` is how a test says
   * it is not what this one is about.
   */
  const PUBLIC = "https://localhost/hero.png"
  const anywhere = (): null => null

  it("hands a reply to the part that reads it", async () => {
    const result = await fetchAsset(
      PUBLIC,
      limits({ allow: anywhere }),
      transport((_call, reply) => {
        reply(body(BYTES))
      }),
    )

    expect(result).toMatchObject({ ok: true })
    expect(result.ok ? result.asset.contentType : "").toBe("image/png")
  })

  it("refuses when the reply is not what the bundle described", async () => {
    const result = await fetchAsset(
      PUBLIC,
      limits({ allow: anywhere }),
      transport((_call, reply) => {
        reply(body(new Uint8Array([7, 7, 7])))
      }),
    )

    expect(result).toMatchObject({ reason: "hash-mismatch" })
  })

  it("turns a timeout into a refusal rather than hanging", async () => {
    const result = await fetchAsset(
      PUBLIC,
      limits({ allow: anywhere }),
      transport((call) => {
        call.emit("timeout")
      }),
    )

    expect(result).toMatchObject({ reason: "unreachable" })
  })

  it("turns a socket error into a refusal", async () => {
    const result = await fetchAsset(
      PUBLIC,
      limits({ allow: anywhere }),
      transport((call) => {
        call.emit("error", new Error("connection refused"))
      }),
    )

    expect(result).toMatchObject({ reason: "unreachable" })
  })

  it("refuses when the guard rejects the address it resolved to", async () => {
    // The default policy, through the whole path: resolve, check, refuse,
    // and never reach the part that would have replied.
    const result = await fetchAsset(
      PUBLIC,
      limits(),
      transport((_call, reply) => {
        reply(body(BYTES))
      }),
    )

    expect(result).toMatchObject({ reason: "blocked-address" })
  })

  it("refuses when the host does not resolve", async () => {
    const result = await fetchAsset(
      "https://nothing.invalid/hero.png",
      limits({ allow: anywhere }),
      transport((_call, reply) => {
        reply(body(BYTES))
      }),
    )

    expect(result).toMatchObject({ reason: "unreachable" })
  })

  it("refuses a reply that does not say how it went", async () => {
    // `statusCode` is optional on an IncomingMessage. Absent is not success.
    const result = await fetchAsset(
      PUBLIC,
      limits({ allow: anywhere }),
      transport((_call, reply) => {
        reply(Object.assign(Readable.from([Buffer.from(BYTES)]), { headers: {} }))
      }),
    )

    expect(result).toMatchObject({ reason: "status" })
  })

  it("falls back to a type nothing trusts when the server names none", async () => {
    const result = await fetchAsset(
      PUBLIC,
      limits({ allow: anywhere }),
      transport((_call, reply) => {
        reply(Object.assign(Readable.from([Buffer.from(BYTES)]), { statusCode: 200, headers: {} }))
      }),
    )

    expect(result.ok ? result.asset.contentType : "").toBe("application/octet-stream")
  })

  it("answers once, however many things go wrong", async () => {
    // A socket that times out and then errors is ordinary. Resolving twice
    // would be a promise nobody can reason about.
    const result = await fetchAsset(
      PUBLIC,
      limits({ allow: anywhere }),
      transport((call) => {
        call.emit("timeout")
        call.emit("error", new Error("and then this"))
      }),
    )

    expect(result).toMatchObject({ reason: "unreachable" })
  })
})
