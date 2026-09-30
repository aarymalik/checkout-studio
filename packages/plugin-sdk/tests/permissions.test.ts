import { describe, expect, it } from "vitest"

import {
  PERMISSIONS,
  PERMISSION_IDS,
  createGrant,
  isRestricted,
  restrictedAmong,
  withheld,
} from "../src/permissions"

describe("permissions", () => {
  it("marks the ones that need the user's approval", () => {
    expect(isRestricted("schema:read")).toBe(false)
    expect(isRestricted("schema:write")).toBe(true)
    expect(isRestricted("payments")).toBe(true)
  })

  it("describes every permission for the approval prompt", () => {
    for (const id of PERMISSION_IDS) {
      expect(PERMISSIONS[id].label.length).toBeGreaterThan(0)
      expect(PERMISSIONS[id].description.length).toBeGreaterThan(0)
    }
  })

  it("filters a request down to the restricted ones", () => {
    expect(restrictedAmong(["schema:read", "schema:write", "assets:read", "payments"])).toEqual([
      "schema:write",
      "payments",
    ])
  })

  it("answers only what it was granted", () => {
    const grant = createGrant(["schema:read", "payments"])

    expect(grant.has("schema:read")).toBe(true)
    expect(grant.has("payments")).toBe(true)
    expect(grant.has("publish")).toBe(false)
    expect(grant.list()).toEqual(["schema:read", "payments"])
  })

  it("cannot be tampered with by the plugin holding it", () => {
    const grant = createGrant(["schema:read"])

    // A plugin asking "may I?" must not be able to change the answer.
    expect(Object.isFrozen(grant)).toBe(true)
  })

  it("names the restricted permissions a plugin asked for and did not get", () => {
    expect(withheld(["schema:read", "schema:write", "publish"], ["schema:write"])).toEqual([
      "publish",
    ])
  })

  it("withholds nothing when only unrestricted permissions were asked for", () => {
    expect(withheld(["schema:read", "assets:read"], [])).toEqual([])
  })
})
