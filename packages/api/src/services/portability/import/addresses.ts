import "server-only"

import { isIP } from "node:net"

/**
 * Which addresses a bundle is allowed to send us to.
 *
 * An imported JSON bundle names its assets by URL, and that URL was chosen by
 * whoever made the file. Fetching it is this product making a request on a
 * stranger's instruction, which is the whole of server-side request forgery:
 * the danger is not what comes back but where the request goes — a cloud
 * instance's metadata endpoint, a database admin page on the same network, an
 * internal service that does something when you GET it.
 *
 * So the rule is an allow-list by exclusion: a public address is fine and
 * everything reserved for something else is not. Written as ranges rather
 * than as names because `localhost` is one of a hundred ways to say
 * `127.0.0.1`, and the thing that has to be checked is the address a socket
 * would actually connect to.
 *
 * ## The ranges, and what each is for
 *
 * Taken from the IANA special-purpose registries rather than from memory of
 * which ones matter. The one that always matters is 169.254.0.0/16: the link
 * local range holds 169.254.169.254, which is the metadata endpoint on every
 * major cloud and hands out credentials to anything that asks.
 */

/** IPv4 ranges that are not somebody's public web server. */
const BLOCKED_V4: readonly { base: string; bits: number; why: string }[] = [
  { base: "0.0.0.0", bits: 8, why: "this network" },
  { base: "10.0.0.0", bits: 8, why: "private" },
  { base: "100.64.0.0", bits: 10, why: "carrier-grade NAT" },
  { base: "127.0.0.0", bits: 8, why: "loopback" },
  { base: "169.254.0.0", bits: 16, why: "link local, and the cloud metadata endpoint" },
  { base: "172.16.0.0", bits: 12, why: "private" },
  { base: "192.0.0.0", bits: 24, why: "IETF protocol assignments" },
  { base: "192.0.2.0", bits: 24, why: "documentation" },
  { base: "192.168.0.0", bits: 16, why: "private" },
  { base: "198.18.0.0", bits: 15, why: "benchmarking" },
  { base: "198.51.100.0", bits: 24, why: "documentation" },
  { base: "203.0.113.0", bits: 24, why: "documentation" },
  { base: "224.0.0.0", bits: 4, why: "multicast" },
  { base: "240.0.0.0", bits: 4, why: "reserved" },
]

function toNumber(address: string): number {
  return address.split(".").reduce((total, part) => total * 256 + Number(part), 0)
}

/** Why an address was refused, or null when it is a public one. */
export function addressRefusal(address: string): string | null {
  const version = isIP(address)

  if (version === 4) {
    const value = toNumber(address)

    for (const range of BLOCKED_V4) {
      // No range here is a /0, so the shift is always a real one.
      const mask = (-1 << (32 - range.bits)) >>> 0

      if ((value & mask) >>> 0 === (toNumber(range.base) & mask) >>> 0) return range.why
    }

    return null
  }

  if (version === 6) return refusalV6(address)

  // Not an address at all. Nothing should reach here — a lookup answers with
  // addresses — and refusing is the only safe reading of a string we cannot
  // classify.
  return "not an IP address"
}

/**
 * IPv6, by prefix rather than by arithmetic.
 *
 * The ranges that matter are all at the top of the address, and a v6 literal
 * has one normalized form from `node:net`'s point of view. An
 * IPv4-mapped address is checked as the IPv4 address it carries, because
 * `::ffff:127.0.0.1` is a loopback connection however it is spelled.
 */
function refusalV6(address: string): string | null {
  const lower = address.toLowerCase()
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/u.exec(lower)

  if (mapped?.[1] !== undefined) return addressRefusal(mapped[1])

  if (lower === "::" || lower === "::1") return "loopback"
  if (lower.startsWith("fe80:")) return "link local"
  if (/^f[cd][0-9a-f]{2}:/u.test(lower)) return "unique local"
  if (lower.startsWith("ff")) return "multicast"
  if (lower.startsWith("2001:db8:")) return "documentation"

  return null
}

/** Whether a socket may connect there. */
export function isPublicAddress(address: string): boolean {
  return addressRefusal(address) === null
}
