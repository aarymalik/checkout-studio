import "server-only"

import {
  assetRepository,
  importRepository,
  pageRepository,
  requireProject,
} from "@checkout-studio/database"
import type { TenantContext } from "@checkout-studio/database"
import { contentHash } from "@checkout-studio/utils"
import type { Prisma } from "@checkout-studio/database"

import { resolveTheme } from "../../pages/theme"
import type { ObjectStore } from "../../assets/store"
import { readJsonBundle } from "./integrity"
import { checkCompatibility } from "./compatibility"
import type { Installation } from "./compatibility"
import { readPageBundle } from "./read"
import type { Registry } from "./read"
import { analyzeImport } from "./analyze"
import type { ImportPlan } from "./analyze"
import { rehydrateAssets } from "./rehydrate"
import type { RehydrationLimits } from "./rehydrate"
import { mergeTheme } from "./theme"
import { regenerateDocument } from "./regenerate"
import type { ImportWarning, ThemeStrategy } from "./plan"
import type { fetchAsset } from "./fetch"

/**
 * Importing a page, from a file to a row.
 *
 * The workflow in docs/export-import.md, in the order it insists on. Every
 * stage is somewhere else and proved on its own; what lives here is the
 * order, what each failure is called, and the report at the end.
 *
 * ## Nothing is written until everything can be
 *
 * Integrity, the schema, compatibility and the plan all run before a byte is
 * fetched, and the rows are written in one transaction after. The only thing
 * that outlives a failure is object storage, which cannot join a
 * transaction — and what it keeps is bytes under a key that is their own
 * hash, which nothing references and nothing can reach without having the
 * file already.
 *
 * ## Every refusal says which stage
 *
 * `ImportReport.failure` carries a stage because the five refusals want five
 * different things from the person reading them. A checksum mismatch means
 * download it again; a missing plugin means install something; a blocked
 * address means the bundle points somewhere it should not, which is not
 * their fault and not something they can fix by retrying.
 */

export interface ImportEnvironment {
  installation: Installation
  /** Populated by the application: packages/api never imports a plugin. */
  registry: Registry
  store: ObjectStore
  themeStrategy: ThemeStrategy
  limits: RehydrationLimits
  /** Defaults to the moment of import. Given, so a test can read a report. */
  now?: Date
  /** Injected so a test needs no network. */
  fetch?: typeof fetchAsset
}

export interface ImportReport {
  success: boolean
  durationMs: number
  created: {
    pageIds: string[]
    assetIds: string[]
    themeId?: string
  }
  statistics: {
    nodesImported: number
    assetsUploaded: number
    assetsReused: number
    bytesTransferred: number
  }
  migrations: { from: string; to: string }[]
  warnings: ImportWarning[]
  /** Present only when success is false. */
  failure?: { stage: string; code: string; message: string }
}

export interface ImportOutcome {
  report: ImportReport
  /** What was going to happen. Absent when the file never became a plan. */
  plan: ImportPlan | null
}

export async function importPage(
  tenant: TenantContext,
  text: string,
  environment: ImportEnvironment,
): Promise<ImportOutcome> {
  /*
   * Measured on the real clock at both ends, never on `now`. That one is a
   * stamp — the date written onto an imported theme — and a test that fixes
   * it to a moment would otherwise get a duration measured from there to
   * here, which is a number with no meaning and often a negative one.
   */
  /*
   * Asked first, so an import with no project to import into fails the same
   * way every other tenant-scoped operation does rather than part way
   * through with whatever the first repository happened to say.
   */
  const projectId = requireProject(tenant, "Import")

  const started = Date.now()
  const since = (): number => Date.now() - started
  const failed = (stage: string, code: string, message: string): ImportOutcome => ({
    plan: null,
    report: empty(since(), { stage, code, message }),
  })

  const file = readJsonBundle(text)

  if (!file.ok) return failed("integrity", file.reason, file.message)

  const read = readPageBundle(file.bundle.payload, environment.registry)

  if (!read.ok) {
    return failed("schema", read.reason, read.problems.map((problem) => problem.message).join(" "))
  }

  const compatibility = checkCompatibility(file.bundle.manifest, environment.installation)

  /*
   * The plan is built whether or not it can be carried out, because a
   * blocked import still has to say what it would have done — and the plan
   * is what says it.
   */
  const project = {
    assets: await assetRepository.list(tenant),
    slugsInUse: await pageRepository.slugsInUse(tenant),
  }
  const plan = analyzeImport({
    manifest: file.bundle.manifest,
    assets: read.bundle.assets,
    page: read.bundle.page,
    target: { projectId: projectId, mode: "into-project" },
    project,
    compatibility,
    themeStrategy: environment.themeStrategy,
  })

  const blocker = plan.blockers[0]

  if (blocker !== undefined) {
    return {
      plan,
      report: empty(since(), {
        stage: "compatibility",
        code: blocker.code,
        message: `${blocker.message} ${blocker.remediation}`,
      }),
    }
  }

  const rehydrated = await rehydrateAssets({
    tenant,
    entries: read.bundle.assets,
    held: project.assets,
    store: environment.store,
    limits: environment.limits,
    ...(environment.fetch === undefined ? {} : { fetch: environment.fetch }),
  })

  if (!rehydrated.ok) {
    return {
      plan,
      report: empty(since(), {
        stage: "assets",
        code: rehydrated.reason,
        message: rehydrated.message,
      }),
    }
  }

  const theme = mergeTheme({
    strategy: environment.themeStrategy,
    bundle: read.bundle.theme,
    target: await resolveTheme(projectId, read.bundle.document.theme),
    freshThemeId: namespacedThemeId(file.bundle.manifest.bundleId),
    now: environment.now ?? new Date(),
  })

  let nodesImported = 0

  const committed = await importRepository.commit(tenant, {
    assets: rehydrated.rehydrated.assets,
    // A bundle calls it a name and a page row calls it a title. Same string.
    page: { title: read.bundle.page.name, slug: read.bundle.page.slug },
    document: (assets) => {
      /*
       * Run here rather than earlier because the ids are only real once the
       * rows exist — see importRepository.commit. An unmapped reference
       * returns null, which rolls the whole thing back.
       */
      const regenerated = regenerateDocument(read.bundle.document, assets)

      if (!regenerated.ok) return null

      nodesImported = regenerated.nodes.size

      return {
        ...regenerated.document,
        theme: { themeId: theme.themeId },
      } as unknown as Prisma.InputJsonValue
    },
    theme:
      theme.write === null
        ? null
        : {
            name: theme.write.theme.name,
            tokens: theme.write.theme as unknown as Prisma.InputJsonValue,
            replace: theme.write.as === "replace",
          },
  })

  if (!committed.ok) {
    return {
      plan,
      report: empty(since(), {
        stage: "commit",
        code: committed.reason,
        message:
          committed.reason === "slug-taken"
            ? `This project already has a page at /${read.bundle.page.slug}.`
            : "The imported page could not be rewritten to fit this project.",
      }),
    }
  }

  return {
    plan,
    report: {
      success: true,
      durationMs: since(),
      created: {
        pageIds: [committed.pageId],
        assetIds: [...committed.assets.values()],
        ...(committed.themeId === null ? {} : { themeId: committed.themeId }),
      },
      statistics: {
        nodesImported,
        assetsUploaded: rehydrated.rehydrated.uploaded,
        assetsReused: rehydrated.rehydrated.reused,
        bytesTransferred: rehydrated.rehydrated.bytesTransferred,
      },
      migrations: compatibility.ok && compatibility.migrate !== null ? [compatibility.migrate] : [],
      warnings: plan.warnings,
    },
  }
}

/** A report for an import that did not happen. Always has a failure to name. */
function empty(durationMs: number, failure: NonNullable<ImportReport["failure"]>): ImportReport {
  return {
    success: false,
    durationMs,
    created: { pageIds: [], assetIds: [] },
    statistics: { nodesImported: 0, assetsUploaded: 0, assetsReused: 0, bytesTransferred: 0 },
    migrations: [],
    warnings: [],
    failure,
  }
}

/**
 * The logical id a namespaced theme is given.
 *
 * Logical, not the row's: a document references the id written inside the
 * tokens, and `resolveTheme` looks it up among a project's rows by that.
 * Derived from the bundle so importing the same bundle twice names the same
 * theme rather than leaving a second copy of it beside the first.
 */
function namespacedThemeId(bundleId: string): string {
  return `theme_${contentHash(new TextEncoder().encode(bundleId)).slice(0, 16)}`
}
