-- The folder an asset is filed under. Null is unfiled, which is every row
-- that exists when this runs.
ALTER TABLE "Asset" ADD COLUMN     "folder" TEXT;

-- Drift, not part of the above, and here because Prisma found it while
-- diffing: `@@index([projectId, slug])` has been on Page in schema.prisma
-- with no migration that creates it, so no database has ever had it. Adding
-- it in its own migration would be tidier and would also mean two migrations
-- whose order does not matter; adding it here means it finally exists.
CREATE INDEX "Page_projectId_slug_idx" ON "Page"("projectId", "slug");
