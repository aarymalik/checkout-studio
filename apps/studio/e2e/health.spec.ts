import { expect, test } from "@playwright/test"

test("liveness responds without dependencies", async ({ request }) => {
  const response = await request.get("/api/health/live")

  expect(response.status()).toBe(200)
  expect(await response.json()).toEqual({ status: "alive" })
})

test("readiness reports healthy", async ({ request }) => {
  const response = await request.get("/api/health")
  const body = (await response.json()) as { status: string }

  expect(response.status()).toBe(200)
  expect(body.status).toBe("healthy")
})
