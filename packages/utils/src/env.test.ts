import { describe, expect, it } from "vitest"
import { z } from "zod"
import { createEnv, EnvironmentError } from "./env"

const schema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive(),
  OPTIONAL_FLAG: z.string().optional(),
})

describe("createEnv", () => {
  it("returns the parsed environment when every variable is valid", () => {
    const env = createEnv(schema, { DATABASE_URL: "postgres://localhost/db", PORT: "3000" })

    expect(env.DATABASE_URL).toBe("postgres://localhost/db")
    expect(env.PORT).toBe(3000)
  })

  it("freezes the result so configuration cannot be mutated at runtime", () => {
    const env = createEnv(schema, { DATABASE_URL: "postgres://localhost/db", PORT: "3000" })

    expect(Object.isFrozen(env)).toBe(true)
  })

  it("throws EnvironmentError naming the variable that is missing", () => {
    expect(() => createEnv(schema, { PORT: "3000" })).toThrow(EnvironmentError)

    try {
      createEnv(schema, { PORT: "3000" })
      expect.unreachable("should have thrown")
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentError)
      expect((error as EnvironmentError).message).toContain("DATABASE_URL")
    }
  })

  it("names the variable that is malformed, and what was wrong with it", () => {
    try {
      createEnv(schema, { DATABASE_URL: "not-a-url", PORT: "3000" })
      expect.unreachable("should have thrown")
    } catch (error) {
      expect((error as EnvironmentError).message).toMatch(/DATABASE_URL/)
    }
  })

  it("reports every problem at once rather than one per run", () => {
    try {
      createEnv(schema, {})
      expect.unreachable("should have thrown")
    } catch (error) {
      const { problems } = error as EnvironmentError
      expect(problems).toHaveLength(2)
      expect(problems.join("\n")).toMatch(/DATABASE_URL/)
      expect(problems.join("\n")).toMatch(/PORT/)
    }
  })

  it("accepts an environment where only optional variables are absent", () => {
    const env = createEnv(schema, { DATABASE_URL: "postgres://localhost/db", PORT: "1" })

    expect(env.OPTIONAL_FLAG).toBeUndefined()
  })
})
