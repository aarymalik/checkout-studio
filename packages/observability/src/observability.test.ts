import { describe, expect, it } from "vitest"
import { createLogger, type LogRecord } from "./logger/logger"
import { hashValue, redact, REDACTED, truncateIp } from "./logger/redact"
import { createInMemorySink, createMetrics, templateRoute } from "./metrics/metrics"
import { span } from "./tracing/tracer"
import { createContext, currentContext, enrichContext, runWithContext } from "./context/server"
import { createCorrelationId } from "./context/TelemetryContext"

const seed = { surface: "api" as const, environment: "test" as const, release: "0.0.0" }

describe("redaction", () => {
  it("drops secrets outright", () => {
    const result = redact({
      password: "hunter2",
      token: "abc",
      STRIPE_SECRET_KEY: "sk_live_x",
      authorization: "Bearer x",
      cvc: "123",
      // Separator styles that an exact-match list would miss.
      clerkSecretKey: "sk_x",
      STRIPE_WEBHOOK_SECRET: "whsec_x",
      "api-key": "k",
      refreshToken: "r",
    }) as Record<string, unknown>

    for (const value of Object.values(result)) {
      expect(value).toBe(REDACTED)
    }
  })

  it("hashes email rather than dropping it, so joins remain possible", () => {
    const result = redact({ email: "person@example.com" }) as { email: string }

    expect(result.email).not.toContain("@")
    expect(result.email).toMatch(/^h_/)
    expect(result.email).toBe(hashValue("person@example.com"))
  })

  it("truncates IP addresses", () => {
    expect(truncateIp("192.168.1.55")).toBe("192.168.1.0/24")
    expect(truncateIp("2001:db8:85a3:1::1")).toBe("2001:db8:85a3::/48")
    expect((redact({ ip: "10.0.0.7" }) as { ip: string }).ip).toBe("10.0.0.0/24")
  })

  it("redacts nested objects and arrays", () => {
    const result = redact({
      user: { email: "a@b.com", profile: { password: "x" } },
      items: [{ token: "t" }],
    }) as { user: { profile: { password: string } }; items: Array<{ token: string }> }

    expect(result.user.profile.password).toBe(REDACTED)
    expect(result.items[0]?.token).toBe(REDACTED)
  })

  it("keeps ordinary fields intact", () => {
    expect(redact({ pageId: "page_1", nodeCount: 247, ok: true })).toEqual({
      pageId: "page_1",
      nodeCount: 247,
      ok: true,
    })
  })

  it("stops at a sane depth rather than recursing forever", () => {
    const cyclic: Record<string, unknown> = {}
    cyclic["self"] = cyclic

    expect(() => redact(cyclic)).not.toThrow()
  })
})

describe("logger", () => {
  function capture() {
    const records: LogRecord[] = []
    return { records, log: createLogger({ level: "trace", sink: (r) => records.push(r) }) }
  }

  it("writes a structured record with a stable shape", () => {
    const { records, log } = capture()

    log.info("page.published", { pageId: "page_1", nodeCount: 247 })

    expect(records[0]).toMatchObject({
      level: "info",
      event: "page.published",
      data: { pageId: "page_1", nodeCount: 247 },
    })
    expect(records[0]?.timestamp).toMatch(/^\d{4}-/)
  })

  it("redacts data before it reaches the sink", () => {
    const { records, log } = capture()

    log.info("auth.signin", { email: "a@b.com", password: "hunter2" })

    expect(records[0]?.data?.["password"]).toBe(REDACTED)
    expect(records[0]?.data?.["email"]).not.toContain("@")
  })

  it("attaches the active correlation context automatically", () => {
    const { records, log } = capture()
    const context = createContext({ ...seed, projectId: "proj_1" })

    runWithContext(context, () => log.info("test.event"))

    expect(records[0]?.context?.["correlationId"]).toBe(context.correlationId)
    expect(records[0]?.context?.["projectId"]).toBe("proj_1")
  })

  it("records an error's code, domain and severity", () => {
    const { records, log } = capture()

    log.error(
      "api.failed",
      { route: "/x" },
      {
        code: "DATABASE_ERROR",
        domain: "internal",
        severity: "critical",
        message: "insert failed",
      },
    )

    expect(records[0]?.error).toMatchObject({ code: "DATABASE_ERROR", severity: "critical" })
  })

  it("honours the minimum level", () => {
    const records: LogRecord[] = []
    const log = createLogger({ level: "warn", sink: (r) => records.push(r) })

    log.debug("ignored")
    log.info("ignored")
    log.warn("kept")

    expect(records).toHaveLength(1)
    expect(records[0]?.event).toBe("kept")
  })
})

describe("metrics", () => {
  it("records counters, gauges and histograms", () => {
    const sink = createInMemorySink()
    const m = createMetrics(sink)

    m.increment("publish_total", { outcome: "success" })
    m.gauge("editor_memory_bytes", 1024)
    m.histogram("api_request_duration_ms", 42, { route: "/api/v1/pages" })

    expect(sink.samples().map((s) => s.kind)).toEqual(["counter", "gauge", "histogram"])
    expect(sink.samples()[2]?.value).toBe(42)
  })

  it("templates ids out of a route so it can be a label", () => {
    expect(templateRoute("/api/v1/projects/proj_abc12345/pages/page_def67890")).toBe(
      "/api/v1/projects/[id]/pages/[id]",
    )
    expect(templateRoute("/api/v1/projects")).toBe("/api/v1/projects")
  })
})

describe("spans", () => {
  it("returns the operation's result and measures it", async () => {
    const sink = createInMemorySink()
    let observed = 0

    const result = await span(
      "db.page.find",
      async (s) => {
        s.setAttributes({ "checkout.page_id": "page_1" })
        observed = s.durationMs
        return "found"
      },
      { attributes: { "db.model": "Page" } },
    )

    expect(result).toBe("found")
    expect(observed).toBeGreaterThanOrEqual(0)
    expect(sink.samples()).toHaveLength(0)
  })

  it("propagates a failure rather than swallowing it", async () => {
    await expect(
      span("db.page.find", () => {
        throw new Error("boom")
      }),
    ).rejects.toThrow("boom")
  })
})

describe("correlation context", () => {
  it("generates readable, unique correlation ids", () => {
    const ids = new Set(Array.from({ length: 50 }, createCorrelationId))

    expect(ids.size).toBe(50)
    expect([...ids][0]).toMatch(/^req_[0-9a-f]{16}$/)
  })

  it("is undefined outside a request", () => {
    expect(currentContext()).toBeUndefined()
  })

  it("survives an await boundary", async () => {
    const context = createContext(seed)

    await runWithContext(context, async () => {
      await Promise.resolve()
      expect(currentContext()?.correlationId).toBe(context.correlationId)
    })
  })

  it("can be enriched once the tenant is known", () => {
    const context = createContext(seed)

    runWithContext(context, () => {
      enrichContext({ userId: "user_1" })
      expect(currentContext()?.userId).toBe("user_1")
    })
  })

  it("does not leak between concurrent requests", async () => {
    const a = createContext(seed)
    const b = createContext(seed)

    await Promise.all([
      runWithContext(a, async () => {
        await new Promise((r) => setTimeout(r, 5))
        expect(currentContext()?.correlationId).toBe(a.correlationId)
      }),
      runWithContext(b, async () => {
        expect(currentContext()?.correlationId).toBe(b.correlationId)
      }),
    ])
  })
})
