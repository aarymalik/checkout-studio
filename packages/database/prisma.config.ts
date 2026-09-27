import { defineConfig, env } from "@prisma/config"

/**
 * Prisma 7 moves the connection URL out of the schema: the schema describes
 * structure, this file describes where it lives. Migration and introspection
 * commands read it; the client itself receives a driver adapter instead.
 */
/**
 * Prisma builds a scratch database to work out what a migration should contain,
 * then throws it away. Derived from the real URL rather than configured, so
 * there is nothing to set up and nothing to get wrong — and named beside the
 * real database so it is obvious what it is.
 */
const databaseUrl = env("DATABASE_URL")
const shadowDatabaseUrl = databaseUrl.replace(/\/([^/?]+)(\?|$)/, "/$1_shadow$2")

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.ts",
  },
  datasource: {
    url: databaseUrl,
    shadowDatabaseUrl,
  },
})
