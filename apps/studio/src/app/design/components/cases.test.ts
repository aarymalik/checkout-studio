import { describe, expect, it } from "vitest"

import { registry } from "@/studio/registry"
import { COMPONENT_CASES } from "./cases"

/**
 * A component nobody photographed is a component nothing is watching.
 *
 * The same rule the interface gallery keeps, read against the registry rather
 * than against a package's exports: whatever the installed plugins register is
 * what a document can contain, so that is what has to appear in a case.
 *
 * It is also what makes this matrix survive `core-embed` and the checkout
 * plugin. Registering a component and forgetting to photograph it fails here
 * rather than going quietly unwatched.
 */
describe("the component gallery", () => {
  it("covers every type the registry holds", () => {
    const covered = new Set(COMPONENT_CASES.flatMap((testCase) => testCase.covers))

    expect(registry.types().filter((type) => !covered.has(type))).toEqual([])
  })

  it("names only types that are registered", () => {
    // A case claiming a component that was renamed or moved reports coverage
    // nobody has.
    const claimed = [...new Set(COMPONENT_CASES.flatMap((testCase) => testCase.covers))]

    expect(claimed.filter((type) => !registry.has(type))).toEqual([])
  })

  it("claims only what its own document draws", () => {
    /*
     * `covers` is a declaration, and the test above reads it as if it were a
     * fact: a case could claim every type in the registry and photograph a
     * blank page, and the matrix would report itself complete.
     *
     * media-and-navigation claimed Image and Video and contains neither.
     */
    for (const testCase of COMPONENT_CASES) {
      const drawn = new Set(Object.values(testCase.document().nodes).map((node) => node.type))

      expect(
        testCase.covers.filter((type) => !drawn.has(type)),
        `${testCase.id} claims what it does not draw`,
      ).toEqual([])
    }
  })

  it("gives every case a distinct id, because the id names its screenshot", () => {
    const ids = COMPONENT_CASES.map((testCase) => testCase.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it("builds a document whose nodes all resolve", () => {
    /*
     * A case holding a node whose parent never lists it renders nothing and
     * photographs blank, which looks like the component being broken.
     */
    for (const testCase of COMPONENT_CASES) {
      const document = testCase.document()

      for (const node of Object.values(document.nodes)) {
        for (const child of node.children) {
          expect(document.nodes[child], `${testCase.id}: ${child}`).toBeDefined()
          expect(document.nodes[child]?.parentId).toBe(node.id)
        }
      }
    }
  })
})
