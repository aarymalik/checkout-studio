-- CreateTable
--
-- Preferences are keyed by user and name, so writing one is an upsert on the
-- primary key and reading a person's whole set is one index scan. No surrogate
-- id: there is nothing else to address a row by.
CREATE TABLE "UserPreference" (
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("userId","key")
);

-- AddForeignKey
-- Cascade: a deleted account leaves no orphaned settings behind.
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
