import { checkoutSchema, UNSUPPORTED_TYPE, type CheckoutSchema, type Node } from "./schema"

/**
 * Validation.
 *
 * Two halves that fail for different reasons and are worth keeping apart:
 * structure, which Zod answers, and references, which it cannot — a document
 * can satisfy every field type and still describe a tree with a cycle in it.
 *
 * Every problem names the nodes it is about. "Invalid schema" is a message
 * nobody can act on; "heading_h82k is not reachable from the root" is.
 *
 * Nothing here knows what a component is. Component rules arrive through a
 * registry, so the engine never contains product-specific logic.
 *
 * See docs/schema.md § Validation.
 */

export type ProblemCode =
  | "structure"
  | "missing-root"
  | "root-has-parent"
  | "id-mismatch"
  | "missing-node"
  | "missing-parent"
  | "parent-mismatch"
  | "multiple-parents"
  | "cycle"
  | "orphan"
  | "unknown-type"
  | "component"

export interface SchemaProblem {
  code: ProblemCode
  message: string
  /** Which nodes this is about. Empty only for document-level problems. */
  nodeIds: readonly string[]
  /** For a structural problem, where in the document it was found. */
  path?: string
}

export interface ValidationResult {
  valid: boolean
  /** A document with any of these must not be loaded as-is. */
  errors: readonly SchemaProblem[]
  /** Worth saying, never fatal. An unknown component type lives here. */
  warnings: readonly SchemaProblem[]
}

/** A rule a component declares about its own nodes, contributed by a plugin. */
export type ComponentValidator = (node: Node, document: CheckoutSchema) => string | null

export interface ValidateOptions {
  /**
   * The component types this installation knows about.
   *
   * Omitted means "do not check": the engine has no catalogue of its own, and
   * inventing one here would put the component library inside the schema.
   */
  knownTypes?: ReadonlySet<string>
  /** Per-type rules. Run only for nodes of that type. */
  components?: ReadonlyMap<string, ComponentValidator>
}

function problem(
  code: ProblemCode,
  message: string,
  nodeIds: readonly string[] = [],
  path?: string,
): SchemaProblem {
  return path === undefined ? { code, message, nodeIds } : { code, message, nodeIds, path }
}

/**
 * Structure alone. Returns the parsed document, or the reasons it is not one.
 */
export function parseDocument(
  value: unknown,
): { ok: true; document: CheckoutSchema } | { ok: false; errors: readonly SchemaProblem[] } {
  const parsed = checkoutSchema.safeParse(value)

  if (parsed.success) return { ok: true, document: parsed.data }

  return {
    ok: false,
    errors: parsed.error.issues.map((issue) => {
      const path = issue.path.map(String).join(".")
      // A failure inside `nodes.<id>.…` is about that node, and saying so turns
      // a path nobody reads into a node somebody can open.
      const nodeIds =
        issue.path[0] === "nodes" && typeof issue.path[1] === "string" ? [issue.path[1]] : []

      return problem("structure", issue.message, nodeIds, path === "" ? "(root)" : path)
    }),
  }
}

/**
 * Everything Zod cannot see: the tree the ids describe.
 *
 * Runs against an already-parsed document, so it can assume every field is the
 * right type and concern itself only with whether the references agree.
 */
export function validateReferences(document: CheckoutSchema): readonly SchemaProblem[] {
  const problems: SchemaProblem[] = []
  const ids = Object.keys(document.nodes)

  // An id stored in two places is an id that can disagree with itself.
  for (const [key, node] of Object.entries(document.nodes)) {
    if (node.id !== key) {
      problems.push(
        problem("id-mismatch", `Stored as "${key}" but carries the id "${node.id}".`, [
          key,
          node.id,
        ]),
      )
    }
  }

  const root = document.nodes[document.root]

  if (root === undefined) {
    problems.push(
      problem("missing-root", `The root "${document.root}" is not among the nodes.`, [
        document.root,
      ]),
    )
  } else if (root.parentId !== null) {
    problems.push(
      problem("root-has-parent", `The root names "${root.parentId}" as its parent.`, [root.id]),
    )
  }

  // Which node claims each child, so a node claimed twice is visible.
  const claimedBy = new Map<string, string[]>()

  for (const id of ids) {
    const node = document.nodes[id] as Node

    for (const child of node.children) {
      if (document.nodes[child] === undefined) {
        problems.push(
          problem("missing-node", `"${id}" lists a child "${child}" that does not exist.`, [
            id,
            child,
          ]),
        )
        continue
      }

      claimedBy.set(child, [...(claimedBy.get(child) ?? []), id])
    }

    if (node.parentId !== null && document.nodes[node.parentId] === undefined) {
      problems.push(
        problem(
          "missing-parent",
          `"${id}" names a parent "${node.parentId}" that does not exist.`,
          [id, node.parentId],
        ),
      )
    }
  }

  for (const [child, parents] of claimedBy) {
    if (parents.length > 1) {
      problems.push(
        problem(
          "multiple-parents",
          `"${child}" is a child of ${parents.length} nodes: ${parents.join(", ")}.`,
          [child, ...parents],
        ),
      )
      continue
    }

    const parent = parents[0] as string
    const node = document.nodes[child] as Node

    if (node.parentId !== parent) {
      problems.push(
        problem(
          "parent-mismatch",
          `"${child}" is a child of "${parent}" but names "${node.parentId ?? "null"}" as its parent.`,
          [child, parent],
        ),
      )
    }
  }

  problems.push(...findCycles(document))

  // Orphans are only meaningful once the root exists; without one, every node
  // is unreachable and saying so 2,000 times helps nobody.
  if (root !== undefined) problems.push(...findOrphans(document))

  return problems
}

/**
 * Cycles in the parent chain.
 *
 * Walked per node with a shared "known to terminate" set, so a long chain is
 * walked once rather than once per node along it.
 */
function findCycles(document: CheckoutSchema): readonly SchemaProblem[] {
  const problems: SchemaProblem[] = []
  // A node whose chain is known to terminate, or to have been reported: either
  // way there is nothing left to learn by walking from it again. This is also
  // what stops one cycle being reported once per node hanging off it.
  const settled = new Set<string>()

  for (const start of Object.keys(document.nodes)) {
    if (settled.has(start)) continue

    const path: string[] = []
    const onPath = new Set<string>()
    let current: string | null = start

    while (current !== null && !settled.has(current)) {
      if (onPath.has(current)) {
        const cycle = path.slice(path.indexOf(current))

        problems.push(
          problem("cycle", `These nodes are their own ancestors: ${cycle.join(" → ")}.`, cycle),
        )
        break
      }

      path.push(current)
      onPath.add(current)

      const node: Node | undefined = document.nodes[current]
      current = node?.parentId ?? null
    }

    for (const id of path) settled.add(id)
  }

  return problems
}

/** Nodes the root cannot reach. They would be invisible and uneditable. */
function findOrphans(document: CheckoutSchema): readonly SchemaProblem[] {
  const reachable = new Set<string>()
  const queue = [document.root]

  while (queue.length > 0) {
    const id = queue.pop() as string

    if (reachable.has(id)) continue
    reachable.add(id)

    for (const child of document.nodes[id]?.children ?? []) queue.push(child)
  }

  const orphans = Object.keys(document.nodes).filter((id) => !reachable.has(id))

  return orphans.length === 0
    ? []
    : [
        problem(
          "orphan",
          `${orphans.length} node(s) cannot be reached from the root: ${orphans.join(", ")}.`,
          orphans,
        ),
      ]
}

/**
 * Component types this installation does not recognise.
 *
 * A warning and never an error. A page that used a since-removed plugin still
 * opens; its nodes carry their original data and fully recover when the plugin
 * returns.
 */
function checkTypes(
  document: CheckoutSchema,
  knownTypes: ReadonlySet<string>,
): readonly SchemaProblem[] {
  const unknown = Object.values(document.nodes).filter(
    (node) => node.type !== UNSUPPORTED_TYPE && !knownTypes.has(node.type),
  )

  return unknown.map((node) =>
    problem("unknown-type", `"${node.type}" is not a component this installation knows.`, [
      node.id,
    ]),
  )
}

function runComponentRules(
  document: CheckoutSchema,
  components: ReadonlyMap<string, ComponentValidator>,
): readonly SchemaProblem[] {
  const problems: SchemaProblem[] = []

  for (const node of Object.values(document.nodes)) {
    const message = components.get(node.type)?.(node, document) ?? null

    if (message !== null) problems.push(problem("component", message, [node.id]))
  }

  return problems
}

/**
 * The whole check: structure, then references, then components.
 *
 * Ordered because each stage assumes the one before it passed — there is no
 * point asking whether a parent chain has a cycle in a document whose nodes are
 * not objects.
 */
export function validate(value: unknown, options: ValidateOptions = {}): ValidationResult {
  const parsed = parseDocument(value)

  if (!parsed.ok) return { valid: false, errors: parsed.errors, warnings: [] }

  const errors = [
    ...validateReferences(parsed.document),
    ...(options.components === undefined
      ? []
      : runComponentRules(parsed.document, options.components)),
  ]

  const warnings =
    options.knownTypes === undefined ? [] : checkTypes(parsed.document, options.knownTypes)

  return { valid: errors.length === 0, errors, warnings }
}
