-- CreateEnum
CREATE TYPE "VerificationPurpose" AS ENUM ('verify_email', 'reset_password');

-- DropIndex
DROP INDEX "User_clerkId_key";

-- AlterTable
--
-- passwordHash is added nullable, backfilled, and only then made NOT NULL.
-- Adding it NOT NULL outright fails against any table that already holds rows,
-- which is every environment that has ever been used.
ALTER TABLE "User" DROP COLUMN "clerkId",
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "passwordHash" TEXT;

-- Existing accounts were authenticated by a provider we no longer use, so they
-- have no password to carry over. They are given a value that cannot be the
-- output of Argon2id and therefore cannot verify against anything: the account
-- survives, its projects survive, and the person recovers it through the same
-- password reset everyone else uses.
UPDATE "User" SET "passwordHash" = 'migrated:no-password' WHERE "passwordHash" IS NULL;

-- Their address was proven by the provider, so it is not re-verified here.
-- Sending every existing account a verification email as a side effect of a
-- schema change would be its own kind of incident.
UPDATE "User" SET "emailVerifiedAt" = "createdAt" WHERE "emailVerifiedAt" IS NULL;

ALTER TABLE "User" ALTER COLUMN "passwordHash" SET NOT NULL;

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" "VerificationPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_tokenHash_key" ON "VerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "VerificationToken_userId_purpose_consumedAt_idx" ON "VerificationToken"("userId", "purpose", "consumedAt");

-- CreateIndex
CREATE INDEX "VerificationToken_expiresAt_idx" ON "VerificationToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

