import "server-only"

import { assetRenditions } from "@checkout-studio/schema"
import type { AssetRendition } from "@checkout-studio/schema"

import { type Prisma, prisma } from "../client"
import { requireProject, TenantScopeError, type TenantContext } from "../tenant"

/**
 * A project's media.
 *
 * ## Identity is the content, not the upload
 *
 * `Asset` is unique on `(projectId, sha256)`, and the hash is of the file that
 * was stored rather than the one that arrived — a sanitized drawing, a
 * re-encoded photograph. So two uploads of the same picture are one row even
 * when one of them carried a script and the other carried GPS coordinates, and
 * the storage key, which is also derived from the hash, is the same file.
 *
 * `create` therefore never fails on a duplicate. It says the row already
 * existed and hands it back, because a merchant uploading a logo they already
 * uploaded has not made a mistake and should not be told they have.
 *
 * ## Re-uploading something deleted brings it back
 *
 * A soft-deleted row matching the same bytes is restored rather than left
 * dead beside a new one. The alternative is either a unique-constraint error
 * on an upload that is entirely reasonable, or two rows for one file where the
 * visible one is whichever the query happened to find.
 *
 * See docs/database.md and docs/security.md § File Upload Security.
 */

export interface NewAsset {
  /** A label, shown in the library. Never used to decide where bytes go. */
  fileName: string
  /** The type the signature matched, never the one a request claimed. */
  mimeType: string
  /** Of the stored file. */
  sizeBytes: number
  /** As displayed. Absent for a type we do not decode. */
  width?: number | null
  height?: number | null
  /** Derived from `sha256` by `masterKey` in @checkout-studio/api. */
  storageKey: string
  url: string
  sha256: string
  renditions: readonly AssetRendition[]
}

export interface StoredAsset {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  width: number | null
  height: number | null
  storageKey: string
  url: string
  sha256: string
  renditions: readonly AssetRendition[]
  createdAt: Date
}

export interface AssetCreation {
  asset: StoredAsset
  /** True when these bytes were already in this project. */
  deduplicated: boolean
}

/**
 * A row whose `renditions` is not a shape this release understands.
 *
 * Only our own code writes that column, and only from a validated list, so
 * this is a release having written something different rather than anything a
 * merchant did. It names the asset, and it is thrown rather than swallowed: an
 * asset quietly reported as having no renditions would be served from its
 * master at full size, which looks like a slow page and not like a bug.
 */
export class AssetRenditionsError extends Error {
  override readonly name = "AssetRenditionsError"

  constructor(
    readonly assetId: string,
    readonly detail: string,
  ) {
    super(`Asset ${assetId} has renditions this release cannot read: ${detail}`)
  }
}

/** An asset is reachable only through a project the tenant owns. */
const ownedBy = (tenant: TenantContext) => ({
  project: { userId: tenant.userId, deletedAt: null },
  deletedAt: null,
})

const COLUMNS = {
  id: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  width: true,
  height: true,
  storageKey: true,
  url: true,
  sha256: true,
  renditions: true,
  createdAt: true,
} as const

type Row = Prisma.AssetGetPayload<{ select: typeof COLUMNS }>

function present(row: Row): StoredAsset {
  const parsed = assetRenditions.safeParse(row.renditions)

  if (!parsed.success) {
    throw new AssetRenditionsError(row.id, parsed.error.issues[0]?.message ?? "unparseable")
  }

  return { ...row, renditions: parsed.data }
}

function writable(renditions: readonly AssetRendition[]): Prisma.InputJsonValue {
  return [...renditions]
}

export const assetRepository = {
  /**
   * Records an asset, or returns the one these bytes already are.
   *
   * The unique index is the whole mechanism. An insert is attempted and a
   * duplicate is answered by reading the row that is already there, rather
   * than looking first and inserting second — a lookup would be a second path
   * to the same answer, correct only when nothing happened in between, and the
   * constraint would still have to catch the case where something did. One
   * path costs a refused insert on the uncommon case and is the path every
   * duplicate actually takes.
   */
  async create(tenant: TenantContext, input: NewAsset): Promise<AssetCreation> {
    const projectId = await ownedProject(tenant)

    try {
      const created = await prisma.asset.create({
        data: {
          projectId,
          fileName: input.fileName,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          width: input.width ?? null,
          height: input.height ?? null,
          storageKey: input.storageKey,
          url: input.url,
          sha256: input.sha256,
          renditions: writable(input.renditions),
        },
        select: COLUMNS,
      })

      return { asset: present(created), deduplicated: false }
    } catch (error) {
      if (!isUniqueViolation(error)) throw error

      /*
       * These bytes are already in this project. The update clears a soft
       * delete, so re-uploading something deleted returns the asset instead of
       * failing on the constraint or leaving a dead row beside a new one. It
       * writes nothing else: the first name wins, because renaming the row
       * would rename it everywhere it is already used.
       */
      const restored = await prisma.asset.update({
        where: { projectId_sha256: { projectId, sha256: input.sha256 } },
        data: { deletedAt: null },
        select: COLUMNS,
      })

      return { asset: present(restored), deduplicated: true }
    }
  },

  async findById(tenant: TenantContext, id: string): Promise<StoredAsset | null> {
    const row = await prisma.asset.findFirst({
      where: { id, ...ownedBy(tenant) },
      select: COLUMNS,
    })

    return row === null ? null : present(row)
  },

  /** Newest first, which is the order somebody who just uploaded expects. */
  async list(tenant: TenantContext): Promise<readonly StoredAsset[]> {
    const projectId = requireProject(tenant, "Asset")

    const rows = await prisma.asset.findMany({
      where: { projectId, ...ownedBy(tenant) },
      orderBy: { createdAt: "desc" },
      select: COLUMNS,
    })

    return rows.map(present)
  },
}

/**
 * The project this write belongs to, once it is known to be the tenant's.
 *
 * `requireProject` only says a project was named. A foreign key is satisfied
 * by any project that exists, so without this a caller holding somebody else's
 * project id could write a row into it — and on a duplicate, be handed the row
 * that was already there. Reads are scoped by `ownedBy`; this is the same
 * question asked before a write.
 */
async function ownedProject(tenant: TenantContext): Promise<string> {
  const projectId = requireProject(tenant, "Asset")

  const owned = await prisma.project.findFirst({
    where: { id: projectId, userId: tenant.userId, deletedAt: null },
    select: { id: true },
  })

  if (owned === null) {
    throw new TenantScopeError("Asset", `project ${projectId} does not belong to this tenant`)
  }

  return projectId
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  )
}
