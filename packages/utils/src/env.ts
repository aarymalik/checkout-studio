import { type z } from "zod"

/**
 * Environment validation.
 *
 * Applications are the only place environment variables are read, per
 * docs/monorepo-structure.md, and they read them through this function. A
 * missing or malformed variable fails at startup with a message naming every
 * problem at once, rather than producing a mysterious failure later.
 */

export class EnvironmentError extends Error {
  override readonly name = "EnvironmentError"
  readonly problems: readonly string[]

  constructor(problems: readonly string[]) {
    super(
      [
        `Invalid environment configuration (${problems.length} problem${problems.length === 1 ? "" : "s"}):`,
        ...problems.map((problem) => `  - ${problem}`),
        "",
        "See .env.example for the full list of required variables.",
      ].join("\n"),
    )
    this.problems = problems
  }
}

/**
 * Parses and freezes the environment, or throws EnvironmentError listing every problem.
 *
 * @param schema the variables this application requires
 * @param source defaults to process.env
 */
export function createEnv<TSchema extends z.ZodType>(
  schema: TSchema,
  source: Record<string, string | undefined>,
): Readonly<z.infer<TSchema>> {
  const result = schema.safeParse(source)

  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const variable = issue.path.join(".") || "(root)"
      return `${variable}: ${issue.message}`
    })
    throw new EnvironmentError(problems)
  }

  return Object.freeze(result.data) as Readonly<z.infer<TSchema>>
}
