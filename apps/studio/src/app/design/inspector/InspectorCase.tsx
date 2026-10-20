"use client"

import { PropertyInspector, ownKeys, valuesFor } from "@checkout-studio/editor"
import { defaultTheme } from "@checkout-studio/schema"
import type { Node } from "@checkout-studio/schema"
import type { ReactElement } from "react"

import { propertiesFor } from "@/studio/properties"
import { registry } from "@/studio/registry"
import { INSPECTOR_CASES } from "./cases"
import type { InspectorCase as Case } from "./cases"

/**
 * One panel, built the way the studio builds it.
 *
 * Through `propertiesFor` and `valuesFor` with the shipped registry, so what
 * is photographed is what a merchant sees rather than a panel assembled for
 * the picture. A gallery that passed its own definitions would go on passing
 * after the real ones stopped reaching the panel.
 *
 * ## A node with nothing on it
 *
 * Freshly inserted, which is the state every component starts in and the one
 * where every value comes from the component's own defaults — the stage of the
 * cascade the panel was not reading until recently.
 */
function freshNode(type: string, own: Case["own"] = {}): Node {
  return {
    id: "nod_gallery",
    type,
    parentId: null,
    children: [],
    props: own.props ?? {},
    styles: own.styles === undefined ? {} : { desktop: { base: own.styles } },
    visibility: { hidden: false },
    animations: [],
    metadata: { locked: false },
  } as Node
}

export function InspectorCase({ id }: { id: string }): ReactElement {
  const current = INSPECTOR_CASES.find((testCase) => testCase.id === id)

  if (current === undefined) return <p>No case named {id}.</p>

  const node = freshNode(current.type, current.own)
  const definitions = propertiesFor(current.type)
  const component = registry.get(current.type)

  return (
    <div data-case={id} className="w-80 border-l border-border">
      <PropertyInspector
        definitions={definitions}
        values={valuesFor(node, definitions, {
          ...(component?.defaultProps === undefined ? {} : { props: component.defaultProps }),
          ...(component?.defaultStyles === undefined ? {} : { styles: component.defaultStyles }),
        })}
        theme={defaultTheme}
        overridden={ownKeys(node, definitions)}
        /* Nothing is edited here: a gallery that wrote would need a store. */
        onChange={() => undefined}
        onReset={() => undefined}
      />
    </div>
  )
}
