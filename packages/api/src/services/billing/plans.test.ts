import { describe, expect, it } from "vitest"
import { PLANS, PLAN_IDS, suggestPlan } from "./plans"

describe("plan catalog", () => {
  it("defines every plan named in the pricing documentation", () => {
    expect(PLAN_IDS).toEqual(["free", "starter", "growth", "scale", "enterprise"])
  })

  it("never lets a higher plan offer less than a lower one", () => {
    const ordered = PLAN_IDS.filter((id) => id !== "enterprise")

    for (let i = 1; i < ordered.length; i += 1) {
      const lower = PLANS[ordered[i - 1]!].limits
      const higher = PLANS[ordered[i]!].limits

      for (const key of Object.keys(lower) as Array<keyof typeof lower>) {
        const a = lower[key]
        const b = higher[key]
        if (a === "unlimited") {
          expect(b, `${String(key)} on ${ordered[i]}`).toBe("unlimited")
        } else if (b !== "unlimited") {
          expect(b, `${String(key)} on ${ordered[i]}`).toBeGreaterThanOrEqual(a)
        }
      }
    }
  })

  it("gives Free a real but bounded allowance", () => {
    expect(PLANS.free.limits.projects).toBe(1)
    expect(PLANS.free.limits.monthlyPageViews).toBe(1_000)
    expect(PLANS.free.features.removeBranding).toBe(false)
  })

  it("makes Enterprise unlimited where it should be", () => {
    expect(PLANS.enterprise.limits.projects).toBe("unlimited")
    expect(PLANS.enterprise.features.sso).toBe(true)
  })

  it("suggests the cheapest plan that clears the current usage", () => {
    expect(suggestPlan("publishedPages", 1)).toBe("starter")
    expect(suggestPlan("publishedPages", 10)).toBe("growth")
    expect(suggestPlan("publishedPages", 400)).toBe("scale")
  })
})
