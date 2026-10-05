import { describe, expect, it } from "vitest"

import { createSessionId, describeClient } from "./identity"

/**
 * Who this editing session is.
 *
 * The label ends up in "this page is open in Chrome on macOS", which somebody
 * reads in order to decide whether to take the page from themselves. So what
 * matters is that it is recognisable, and that an unrecognised browser still
 * produces a sentence rather than "undefined on undefined".
 */

const AGENTS = {
  chromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
  firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  operaMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/125.0.0.0",
} as const

describe("describeClient", () => {
  it.each([
    [AGENTS.chromeMac, "Chrome on macOS"],
    [AGENTS.safariMac, "Safari on macOS"],
    [AGENTS.firefoxLinux, "Firefox on Linux"],
    [AGENTS.safariIphone, "Safari on iPhone"],
    [AGENTS.chromeAndroid, "Chrome on Android"],
  ])("reads %# as a browser and a platform", (agent, expected) => {
    expect(describeClient(agent)).toBe(expected)
  })

  it("names Edge rather than the Chrome it is built on", () => {
    // Every Chromium browser also says "Chrome" about itself, so the specific
    // names have to win. Telling somebody their page is open in Chrome when it
    // is open in Edge is worse than saying nothing.
    expect(describeClient(AGENTS.edgeWindows)).toBe("Edge on Windows")
  })

  it("names Opera rather than the Chrome it is built on", () => {
    expect(describeClient(AGENTS.operaMac)).toBe("Opera on macOS")
  })

  it("does not call a Chromium browser Safari, which it also claims to be", () => {
    expect(describeClient(AGENTS.chromeMac)).not.toContain("Safari")
  })

  it("still says something for an agent it does not recognise", () => {
    // The user agent is unreliable by design. A session somebody has to be told
    // about is still a session.
    expect(describeClient("")).toBe("Another browser")
    expect(describeClient("SomeBot/1.0")).toBe("Another browser")
  })

  it("names the platform when only that is recognisable", () => {
    expect(describeClient("Mozilla/5.0 (Windows NT 10.0)")).toBe("A browser on Windows")
  })

  it("names the browser when only that is recognisable", () => {
    expect(describeClient("Firefox/133.0")).toBe("Firefox")
  })
})

describe("createSessionId", () => {
  it("tells two tabs apart, which is the whole thing being detected", () => {
    const ids = new Set(Array.from({ length: 100 }, createSessionId))

    expect(ids.size).toBe(100)
  })

  it("fits what the route accepts", () => {
    const id = createSessionId()

    // The route requires 8 to 64 characters.
    expect(id.length).toBeGreaterThanOrEqual(8)
    expect(id.length).toBeLessThanOrEqual(64)
  })
})
