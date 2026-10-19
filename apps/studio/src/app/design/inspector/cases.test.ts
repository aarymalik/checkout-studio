import { sectionsFor, valuesFor } from "@checkout-studio/editor"
import type { Node } from "@checkout-studio/schema"
import { describe, expect, it } from "vitest"

import { propertiesFor } from "@/studio/properties"
import { registry } from "@/studio/registry"
import { INSPECTOR_CASES } from "./cases"

/**
 * What the pictures cannot tell you about themselves.
 *
 * A screenshot of the wrong thing still passes for ever: a case naming a type
 * nobody registered photographs the "nothing selected" state, and a case
 * asking for a section the panel stopped calling by that name photographs
 * whichever one opened by itself. Both look like a panel. Neither is the one
 * the case is about.
 *
 * Unlike the component gallery next door, this one does not cover every type —
 * a panel full of text boxes says nothing a second panel of text boxes would
 * not, so the cases are chosen for the controls they draw. What is checked
 * here is that each case still draws what it claims to.
 */
function freshNode(type: string): Node {
  return {
    id: "nod_case",
    type,
    parentId: null,
    children: [],
    props: {},
    styles: {},
    visibility: { hidden: false },
    animations: [],
    metadata: { locked: false },
  } as Node
}

function sectionsOf(type: string): readonly string[] {
  const definitions = propertiesFor(type)
  const component = registry.get(type)

  return sectionsFor(
    definitions,
    valuesFor(freshNode(type), definitions, {
      ...(component?.defaultProps === undefined ? {} : { props: component.defaultProps }),
      ...(component?.defaultStyles === undefined ? {} : { styles: component.defaultStyles }),
    }),
  ).map((section) => section.group)
}

describe("the inspector gallery", () => {
  it("names only types that are registered", () => {
    expect(
      INSPECTOR_CASES.filter((testCase) => !registry.has(testCase.type)).map((one) => one.id),
    ).toEqual([])
  })

  it("gives every case a distinct id, because the id names its screenshot", () => {
    const ids = INSPECTOR_CASES.map((testCase) => testCase.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it("asks only for sections the panel actually shows", () => {
    /*
     * The spec clicks a header by its name. A section renamed in the SDK's
     * group list, or emptied by a property moving out of it, would leave the
     * click finding nothing — and Playwright's error would be about a missing
     * button rather than about this list being out of date.
     */
    for (const testCase of INSPECTOR_CASES) {
      if (testCase.section === undefined) continue

      expect(sectionsOf(testCase.type), testCase.id).toContain(testCase.section)
    }
  })

  it("photographs a panel with controls in it", () => {
    /*
     * A case whose properties stopped reaching the panel is the exact fault
     * this gallery was built to catch, and it photographs as a perfectly tidy
     * empty panel — which is why it is asserted here rather than left to the
     * picture.
     *
     * Every one of the registry's components has at least one property, so the
     * panel's "nothing to configure" state is not reachable through any of
     * them; `panel.test.tsx` covers it directly instead. A case was written
     * claiming a Spacer had nothing — it has a height — and this is what said
     * so.
     */
    for (const testCase of INSPECTOR_CASES) {
      expect(propertiesFor(testCase.type).length, testCase.id).toBeGreaterThan(0)
    }
  })
})
