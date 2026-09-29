import { describe, expect, it } from "vitest"

// @ts-expect-error — a plain script, deliberately not TypeScript: it runs
// before anything is compiled.
import { DEFAULT_PORT, resolvePort } from "../scripts/dev.mjs"

/**
 * Which port the development server binds.
 *
 * The cost of getting this wrong is not a server that fails to start — it is a
 * server that starts on one port while every verification link it writes points
 * at another, and the only symptom is somebody saying they never got the email.
 */
describe("resolvePort", () => {
  it("takes the port APP_URL names", () => {
    expect(resolvePort({ APP_URL: "http://localhost:3002" })).toBe("3002")
  })

  // A platform that assigns a port is not asking.
  it("lets PORT win", () => {
    expect(resolvePort({ PORT: "8080", APP_URL: "http://localhost:3002" })).toBe("8080")
  })

  it("ignores an empty PORT rather than binding nothing", () => {
    expect(resolvePort({ PORT: "", APP_URL: "http://localhost:3002" })).toBe("3002")
  })

  it("falls back to Next's own default", () => {
    expect(resolvePort({})).toBe(DEFAULT_PORT)
    expect(DEFAULT_PORT).toBe("3000")
  })

  // Production APP_URL is a domain on 443, where the platform assigns the port.
  it("falls back for a URL that names no port", () => {
    expect(resolvePort({ APP_URL: "https://studio.example.com" })).toBe("3000")
  })

  it("falls back for an APP_URL that is not a URL at all", () => {
    expect(resolvePort({ APP_URL: "not a url" })).toBe("3000")
    expect(resolvePort({ APP_URL: "" })).toBe("3000")
  })

  it("keeps a non-default port on a real host", () => {
    expect(resolvePort({ APP_URL: "https://staging.example.com:8443" })).toBe("8443")
  })
})
