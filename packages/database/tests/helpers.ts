import { prisma } from "../src/client"
import type { TenantContext } from "../src/tenant"

let counter = 0

/** A fresh user, so tests never share tenants and can run in any order. */
export async function createTenant(): Promise<TenantContext & { userId: string }> {
  counter += 1
  const suffix = `${Date.now()}-${counter}`

  const user = await prisma.user.create({
    data: { clerkId: `clerk_${suffix}`, email: `user-${suffix}@example.test` },
  })

  return { userId: user.id }
}

export async function truncateAll(): Promise<void> {
  // AuditLog and Revision refuse TRUNCATE by design, so tests disable those
  // triggers deliberately. Production never does this.
  await prisma.$executeRawUnsafe(`
    DO $$
    DECLARE r RECORD;
    BEGIN
      ALTER TABLE "AuditLog" DISABLE TRIGGER USER;
      ALTER TABLE "Revision" DISABLE TRIGGER USER;
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations')
      LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
      ALTER TABLE "AuditLog" ENABLE TRIGGER USER;
      ALTER TABLE "Revision" ENABLE TRIGGER USER;
    END $$;
  `)
}

export { prisma }
