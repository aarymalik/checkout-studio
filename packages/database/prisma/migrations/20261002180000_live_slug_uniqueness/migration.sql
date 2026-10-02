-- A slug is unique among *live* pages, not among all rows that ever existed.
--
-- A page's slug is its public address: [domain]/[slug]. Deletion is soft, so a
-- deleted page kept its row — and a plain unique index does not know about
-- deletion, so it kept the address too. The effect was that a URL, once used,
-- could never be used again: delete "black-friday" and the next "black-friday"
-- became "black-friday-2", permanently, with nothing in the interface
-- explaining why.
--
-- That was justified on the grounds that a deleted page can be restored and
-- must not collide with whatever took its name. Pages cannot be restored —
-- projects can, pages have no such path — so the justification was circular.
--
-- A partial index says what we actually mean. Deleted pages serve nothing: the
-- published route already filters on both `status` and `deletedAt`, so a
-- deleted slug is a dead address whether or not the index holds it.
--
-- Prisma cannot declare a partial unique index, so it is declared here and the
-- schema carries a comment pointing at this file. The consequence to know: the
-- Prisma Client no longer offers a `projectId_slug` compound key, because from
-- its point of view the pair is not unique.
--
-- If page restore is ever built, restoring into a slug something else has taken
-- must rename rather than fail — which is what every product with a trash does,
-- and a better place for the problem than a URL nobody can reclaim.

DROP INDEX IF EXISTS "Page_projectId_slug_key";

CREATE UNIQUE INDEX "Page_projectId_slug_live_key"
  ON "Page" ("projectId", "slug")
  WHERE "deletedAt" IS NULL;
