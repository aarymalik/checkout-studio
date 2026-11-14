import { describe, expect, it } from "vitest"
import type { CheckoutSchema, ComponentValidator, Node } from "@checkout-studio/schema"
import type { DocumentValidatorRegistration } from "@checkout-studio/plugin-sdk"

import { validateTemplate } from "./validate"
import type { TemplateContext } from "./validate"

/**
 * Whether a template is fit for other people to install.
 *
 * Three of the spec's five checks are facts this layer can establish; the
 * other two are questions about components, and the tests for those are
 * about the hook rather than the rule — the engine's job is to run what a
 * plugin registered, not to know what an image is.
 */

function node(id: string, overrides: Partial<Node> = {}): Node {
  return {
    id,
    type: "core.text",
    parentId: null,
    children: [],
    props: {},
    styles: {},
    visibility: { hidden: false },
    animations: [],
    metadata: { locked: false },
    ...overrides,
  }
}

function document(nodes: readonly Node[]): CheckoutSchema {
  return {
    version: "1.0.0",
    projectId: "prj_one",
    pageId: "pag_one",
    theme: { themeId: "theme_default" },
    settings: {},
    variables: {},
    root: "root",
    nodes: Object.fromEntries(nodes.map((entry) => [entry.id, entry])),
  }
}

const PAGE = document([
  node("root", { type: "core.page", children: ["copy"] }),
  node("copy", { parentId: "root", props: { text: "Pay securely." } }),
])

function context(over: Partial<TemplateContext> = {}): TemplateContext {
  return {
    components: new Map<string, ComponentValidator>(),
    knownTypes: ["core.page", "core.text", "core.image"],
    documentValidators: [],
    assetIds: new Set<string>(),
    ...over,
  }
}

describe("a template that is ready", () => {
  it("has nothing to say about it", () => {
    expect(validateTemplate(PAGE, context())).toEqual({ issues: [], blocked: false })
  })
})

describe("the document itself", () => {
  it("blocks on something that is not a document", () => {
    const check = validateTemplate({ version: "1.0.0" }, context())

    expect(check.blocked).toBe(true)
    expect(check.issues[0]?.severity).toBe("critical")
  })

  it("blocks on a tree that does not hold together", () => {
    const dangling = document([node("root", { type: "core.page", children: ["gone"] })])
    const check = validateTemplate(dangling, context())

    expect(check.blocked).toBe(true)
    expect(check.issues.map((issue) => issue.rule)).toContain("schema.missing-node")
  })

  it("says nothing else once it cannot be read", () => {
    /*
     * The rest of the checks would be the first problem wearing different
     * hats. A publish screen listing five things wrong with a document that
     * has one thing wrong with it is worse than one.
     */
    const broken = validateTemplate(
      { nodes: "not a map" },
      context({
        documentValidators: [failing("never.runs")],
      }),
    )

    expect(broken.issues.every((issue) => issue.rule.startsWith("schema."))).toBe(true)
  })
})

describe("a component type this installation cannot render", () => {
  it("blocks, because publishing is stricter than importing", () => {
    /*
     * On import it is a warning: the page opens and the gate has already
     * said what to install. Publishing is the other way round — a template
     * is something other people install, and the person publishing it is
     * the only one who can fix it.
     */
    const check = validateTemplate(PAGE, context({ knownTypes: ["core.page"] }))

    expect(check.blocked).toBe(true)
    expect(check.issues[0]).toMatchObject({ rule: "schema.unknown-type", severity: "error" })
  })
})

describe("a file the library no longer holds", () => {
  it("blocks, because a template with a broken picture is not ready", () => {
    const withImage = document([
      node("root", { type: "core.page", children: ["hero"] }),
      node("hero", {
        type: "core.image",
        parentId: "root",
        props: { src: { $asset: "ast_gone" } },
      }),
    ])
    const check = validateTemplate(withImage, context())

    expect(check.blocked).toBe(true)
    expect(check.issues[0]).toMatchObject({ rule: "template.missing-asset", severity: "error" })
    expect(check.issues[0]?.message).toContain("ast_gone")
  })

  it("says nothing when the library still holds it", () => {
    const withImage = document([
      node("root", { type: "core.page", children: ["hero"] }),
      node("hero", {
        type: "core.image",
        parentId: "root",
        props: { src: { $asset: "ast_here" } },
      }),
    ])

    expect(
      validateTemplate(withImage, context({ assetIds: new Set(["ast_here"]) })).issues,
    ).toEqual([])
  })

  it("reports each missing file once, however many nodes use it", () => {
    const twice = document([
      node("root", { type: "core.page", children: ["a", "b"] }),
      node("a", { type: "core.image", parentId: "root", props: { src: { $asset: "ast_gone" } } }),
      node("b", { type: "core.image", parentId: "root", props: { src: { $asset: "ast_gone" } } }),
    ])

    expect(validateTemplate(twice, context()).issues).toHaveLength(1)
  })
})

describe("the checks a plugin contributes", () => {
  /**
   * Responsive layout and accessibility, in the spec's words.
   *
   * The engine does not know what an image is, so a rule about alt text
   * cannot live here. What can be tested is that whatever a plugin
   * registered runs, and that its severity decides the outcome the same way
   * the engine's own does.
   */

  function rule(
    name: string,
    severity: "info" | "warning" | "error" | "critical",
  ): DocumentValidatorRegistration {
    return {
      rule: name,
      label: name,
      validate: () => [{ rule: name, severity, message: `${name} says no`, nodeIds: [] }],
    }
  }

  it("run, and their issues arrive beside the engine's", () => {
    const check = validateTemplate(
      PAGE,
      context({ documentValidators: [rule("a11y.image-alt", "error")] }),
    )

    expect(check.issues.map((issue) => issue.rule)).toEqual(["a11y.image-alt"])
  })

  it("block when the plugin says they should", () => {
    expect(
      validateTemplate(PAGE, context({ documentValidators: [rule("a11y.image-alt", "error")] }))
        .blocked,
    ).toBe(true)
  })

  it("do not block when the plugin only means it as advice", () => {
    // A template that is merely imperfect still publishes. The severity is
    // the plugin's to choose, and the engine does not second-guess it.
    const check = validateTemplate(
      PAGE,
      context({ documentValidators: [rule("layout.narrow-on-mobile", "warning")] }),
    )

    expect(check.blocked).toBe(false)
    expect(check.issues).toHaveLength(1)
  })

  it("all run, rather than stopping at the first that complains", () => {
    const check = validateTemplate(
      PAGE,
      context({
        documentValidators: [rule("one.rule", "error"), rule("two.rule", "warning")],
      }),
    )

    expect(check.issues).toHaveLength(2)
  })
})

function failing(name: string): DocumentValidatorRegistration {
  return {
    rule: name,
    label: name,
    validate: () => [{ rule: name, severity: "error", message: "should not run", nodeIds: [] }],
  }
}
