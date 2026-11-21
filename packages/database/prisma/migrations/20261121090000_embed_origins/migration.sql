-- CreateTable
CREATE TABLE "EmbedOrigin" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmbedOrigin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmbedOrigin_pageId_idx" ON "EmbedOrigin"("pageId");

-- CreateIndex
CREATE UNIQUE INDEX "EmbedOrigin_pageId_origin_key" ON "EmbedOrigin"("pageId", "origin");

-- AddForeignKey
ALTER TABLE "EmbedOrigin" ADD CONSTRAINT "EmbedOrigin_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

