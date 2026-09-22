import { describe, expect, it } from "vitest"
import { GET as live } from "./live/route"
import { GET as ready } from "./route"

describe("health endpoints", () => {
  it("reports liveness without touching a dependency", async () => {
    const response = live()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ status: "alive" })
  })

  it("reports readiness with the resolved environment", async () => {
    const response = ready()
    const body = (await response.json()) as { status: string; environment: string }

    expect(response.status).toBe(200)
    expect(body.status).toBe("healthy")
    expect(body.environment).toBe("test")
  })
})
