import { defineConfig, env } from "@prisma/config"

/**
 * Prisma 7 moves the connection URL out of the schema: the schema describes
 * structure, this file describes where it lives. Migration and introspection
 * commands read it; the client itself receives a driver adapter instead.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
})
