import { Prisma, prisma } from "../client"
import { TenantScopeError, requireProject, type TenantContext } from "../tenant"

/**
 * Writing an imported page, all of it or none of it.
 *
 * Step 13 of docs/export-import.md § Import Workflow: "single database
 * transaction… on any failure: roll back". A page whose assets landed but
 * whose document did not is worse than an import that plainly failed —
 * nobody knows it happened, and the rows that did land are unreachable.
 *
 * ## The document is produced inside the transaction, not before it
 *
 * The caller hands in a function rather than a document, and it is called
 * with the asset ids this project actually ended up with. That is forced by
 * the data rather than chosen: an imported asset's id is not knowable until
 * its row exists, because `(projectId, sha256)` is unique and bytes this
 * project already holds resolve to the row that holds them. Deciding ids in
 * advance would be deciding them wrongly whenever a bundle carries a picture
 * the project already has.
 *
 * It also closes a race the plan cannot: another upload landing the same
 * bytes between the plan and the commit changes the answer, and the answer
 * used here is read in the same transaction as the write.
 *
 * Returning null from that function rolls everything back. It is how the
 * caller says the document could not be rewritten — an unmapped reference,
 * per § ID Regeneration — without this layer needing to know what a document
 * is.
 *
 * ## Object storage is not in here
 *
 * It cannot join a transaction. Bytes are written before this runs, under
 * keys derived from their own hash, so a rollback leaves objects no row
 * points at — unreachable without knowing the hash, and adopted by the next
 * upload of the same bytes. The alternative, a staging prefix copied on
 * success, would write every byte twice to avoid an orphan that costs
 * storage and nothing else.
 */

export interface ImportedAsset {
  /** Its id in the bundle. The key of the map handed back. */
  sourceId: string
  fileName: string
  mimeType: string
  sizeBytes: number
  width: number | null
  height: number | null
  storageKey: string
  url: string
  sha256: string
}

export interface ImportedSymbol {
  /** Its id in the bundle. The key of the map handed back. */
  sourceId: string
  name: string
  rootNodeId: string
  nodes: Prisma.InputJsonValue
}

export interface ImportCommit {
  assets: readonly ImportedAsset[]
  symbols: readonly ImportedSymbol[]
  page: { title: string; slug: string }
  /**
   * The document to store, given the ids the import actually got. Null aborts.
   *
   * Both maps for the same reason: neither an asset's id nor a symbol's is
   * knowable until its row exists, and a document naming the bundle's ids
   * would point at another project's rows.
   */
  document: (ids: {
    assets: ReadonlyMap<string, string>
    symbols: ReadonlyMap<string, string>
  }) => Prisma.InputJsonValue | null
  /** The theme to write, or null to leave the project's own alone. */
  theme: { name: string; tokens: Prisma.InputJsonValue; replace: boolean } | null
}

export type ImportCommitResult =
  | {
      ok: true
      pageId: string
      /** Source asset id to the id it has here. */
      assets: ReadonlyMap<string, string>
      /** Source symbol id to the id it has here. */
      symbols: ReadonlyMap<string, string>
      /** The theme written, when one was. */
      themeId: string | null
    }
  /** The caller could not produce a document from the ids it was given. */
  | { ok: false; reason: "document-rejected" }
  /** Another live page already answers to that address. */
  | { ok: false; reason: "slug-taken" }

/** Thrown to roll back, caught at the edge. Never leaves this module. */
class Abort extends Error {
  constructor(readonly reason: "document-rejected") {
    super(reason)
  }
}

export const importRepository = {
  async commit(tenant: TenantContext, input: ImportCommit): Promise<ImportCommitResult> {
    const projectId = requireProject(tenant, "Import")

    /*
     * Ownership before anything is written, for the reason themeRepository
     * states: every read here scopes on the owner, so somebody else's
     * project reads as an empty one — which is the right answer for a read
     * and the wrong premise for a write.
     */
    const owned = await prisma.project.findFirst({
      where: { id: projectId, userId: tenant.userId, deletedAt: null },
      select: { id: true },
    })

    if (owned === null) throw new TenantScopeError("Import", `project ${projectId} is not yours`)

    try {
      return await prisma.$transaction(async (tx) => {
        const assets = new Map<string, string>()

        for (const asset of input.assets) {
          /*
           * Upsert rather than create. Bytes this project already holds
           * resolve to the row holding them, and the update clears a soft
           * delete so a picture deleted last week comes back rather than
           * colliding. Nothing else is written: the first name wins, because
           * renaming the row would rename it everywhere it is already used.
           */
          const row = await tx.asset.upsert({
            where: { projectId_sha256: { projectId, sha256: asset.sha256 } },
            update: { deletedAt: null },
            create: {
              projectId,
              fileName: asset.fileName,
              mimeType: asset.mimeType,
              sizeBytes: asset.sizeBytes,
              width: asset.width,
              height: asset.height,
              storageKey: asset.storageKey,
              url: asset.url,
              sha256: asset.sha256,
            },
            select: { id: true },
          })

          assets.set(asset.sourceId, row.id)
        }

        /*
         * Created rather than matched. Two projects' symbols are different
         * records however alike they look, and reusing one by name would
         * mean an import quietly redefining a footer somebody else wrote.
         */
        const symbols = new Map<string, string>()

        for (const symbol of input.symbols) {
          const row = await tx.symbol.create({
            data: {
              projectId,
              name: symbol.name,
              rootNodeId: symbol.rootNodeId,
              nodes: symbol.nodes,
            },
            select: { id: true },
          })

          symbols.set(symbol.sourceId, row.id)
        }

        const document = input.document({ assets, symbols })

        if (document === null) throw new Abort("document-rejected")

        const page = await tx.page.create({
          data: {
            projectId,
            title: input.page.title,
            slug: input.page.slug,
            draftSchema: document,
          },
          select: { id: true },
        })

        return {
          ok: true as const,
          pageId: page.id,
          assets,
          symbols,
          themeId: await writeTheme(tx, projectId, input.theme),
        }
      })
    } catch (error) {
      if (error instanceof Abort) return { ok: false, reason: error.reason }
      if (isUniqueViolation(error)) return { ok: false, reason: "slug-taken" }

      throw error
    }
  },
}

type Transaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/**
 * The project's theme, replaced or added beside it.
 *
 * `replace` writes the row the project already has, because every page
 * references it by id and they are meant to come with it. With no row to
 * replace there is nothing to preserve, so it is created.
 */
async function writeTheme(
  tx: Transaction,
  projectId: string,
  theme: ImportCommit["theme"],
): Promise<string | null> {
  if (theme === null) return null

  if (theme.replace) {
    const existing = await tx.theme.findFirst({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    })

    if (existing !== null) {
      await tx.theme.update({ where: { id: existing.id }, data: { tokens: theme.tokens } })

      return existing.id
    }
  }

  const created = await tx.theme.create({
    data: { projectId, name: theme.name, tokens: theme.tokens },
    select: { id: true },
  })

  return created.id
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
}
