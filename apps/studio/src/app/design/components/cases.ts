import type { CheckoutSchema, Node } from "@checkout-studio/schema"
import { createDocument } from "@checkout-studio/schema"

/**
 * Every plugin component, as pages to photograph.
 *
 * Separate from the gallery next door, which shows `@checkout-studio/ui` — the
 * studio's own buttons and dialogs. These are the components a *document* is
 * made of, so they cannot be rendered by calling them: they go through
 * `CheckoutRenderer`, with a theme and a registry, exactly as a published page
 * does. A gallery that mounted them directly would photograph something the
 * product never draws.
 *
 * One case per category rather than one per component. A screenshot of a
 * heading alone says less than a screenshot of a heading above a paragraph
 * beside a badge — spacing, type scale and colour are relationships, and a
 * component photographed on its own has none.
 *
 * `covers` is type ids, and a test asserts that every type the shipped registry
 * holds appears in one. A component nobody photographed is a component nothing
 * is watching, which is the same rule the other gallery keeps.
 */
export interface ComponentCase {
  /** Also the screenshot's name, so it must stay stable. */
  id: string
  covers: readonly string[]
  /** The page this case draws. */
  document: () => CheckoutSchema
}

interface Spec {
  id: string
  type: string
  children?: readonly string[]
  props?: Record<string, unknown>
  styles?: Node["styles"]
}

/** A document whose root holds these nodes, nested as they say. */
function pageOf(specs: readonly Spec[], rootChildren: readonly string[]): CheckoutSchema {
  const base = createDocument({
    projectId: "prj_gallery",
    pageId: "pag_gallery",
    themeId: "theme_default",
    random: () => 0.5,
  })
  const root = base.nodes[base.root] as Node
  const nodes: Record<string, Node> = { ...base.nodes }

  for (const spec of specs) {
    nodes[spec.id] = {
      id: spec.id,
      type: spec.type,
      parentId: base.root,
      children: [...(spec.children ?? [])],
      props: (spec.props ?? {}) as Node["props"],
      styles: spec.styles ?? {},
      visibility: { hidden: false },
      animations: [],
      metadata: { locked: false },
    }
  }

  // Reparent, so a child's `parentId` matches the tree the root describes.
  for (const spec of specs) {
    for (const child of spec.children ?? []) {
      const node = nodes[child]

      if (node !== undefined) nodes[child] = { ...node, parentId: spec.id }
    }
  }

  return { ...base, nodes: { ...nodes, [base.root]: { ...root, children: [...rootChildren] } } }
}

export const COMPONENT_CASES: readonly ComponentCase[] = [
  {
    id: "layout",
    covers: [
      "core.page",
      "core.section",
      "core.container",
      "core.stack",
      "core.divider",
      "core.spacer",
    ],
    document: () =>
      pageOf(
        [
          { id: "section", type: "core.section", children: ["container"] },
          {
            id: "container",
            type: "core.container",
            children: ["stack", "divider", "spacer", "after"],
          },
          { id: "stack", type: "core.stack", children: ["one", "two"] },
          { id: "one", type: "core.text", props: { text: "First in a stack" } },
          { id: "two", type: "core.text", props: { text: "Second in a stack" } },
          { id: "divider", type: "core.divider" },
          { id: "spacer", type: "core.spacer" },
          { id: "after", type: "core.text", props: { text: "After the spacer" } },
        ],
        ["section"],
      ),
  },
  {
    id: "grids",
    covers: ["core.grid", "core.columns"],
    document: () =>
      pageOf(
        [
          { id: "section", type: "core.section", children: ["grid", "columns"] },
          { id: "grid", type: "core.grid", children: ["g1", "g2", "g3", "g4"] },
          { id: "g1", type: "core.badge", props: { text: "Grid one" } },
          { id: "g2", type: "core.badge", props: { text: "Grid two" } },
          { id: "g3", type: "core.badge", props: { text: "Grid three" } },
          { id: "g4", type: "core.badge", props: { text: "Grid four" } },
          { id: "columns", type: "core.columns", children: ["c1", "c2"] },
          {
            id: "c1",
            type: "core.text",
            props: {
              text: "A column of text that runs on a little, so the equal split is visible.",
            },
          },
          { id: "c2", type: "core.text", props: { text: "The other column, beside it." } },
        ],
        ["section"],
      ),
  },
  {
    id: "typography",
    covers: ["core.heading", "core.text", "core.badge"],
    document: () =>
      pageOf(
        [
          { id: "section", type: "core.section", children: ["h1", "h2", "body", "badge"] },
          { id: "h1", type: "core.heading", props: { text: "A level one heading", level: 1 } },
          { id: "h2", type: "core.heading", props: { text: "And a level two", level: 2 } },
          {
            id: "body",
            type: "core.text",
            props: {
              text: "Body copy at the theme's scale, long enough to wrap at every width this is photographed at.",
            },
          },
          { id: "badge", type: "core.badge", props: { text: "Badge" } },
        ],
        ["section"],
      ),
  },
  {
    // Named for what it holds: Image and Video are the case below, which is
    // the only place they can be, since this phase has no source to give them.
    id: "controls",
    covers: ["core.icon", "core.button", "core.link"],
    document: () =>
      pageOf(
        [
          {
            id: "section",
            type: "core.section",
            children: ["row", "button", "busy", "off", "link"],
          },
          {
            id: "row",
            type: "core.stack",
            children: ["icon", "caption"],
            styles: { desktop: { base: { flexDirection: "row", alignItems: "center" } } },
          },
          { id: "icon", type: "core.icon", props: { name: "lock", label: "" } },
          {
            id: "caption",
            type: "core.text",
            props: { text: "An icon beside the text it belongs to" },
          },
          { id: "button", type: "core.button", props: { text: "Continue", icon: "arrowRight" } },
          { id: "busy", type: "core.button", props: { text: "Paying", loading: true } },
          { id: "off", type: "core.button", props: { text: "Unavailable", disabled: true } },
          { id: "link", type: "core.link", props: { text: "Read the terms", href: "/terms" } },
        ],
        ["section"],
      ),
  },
  /*
   * Image and Video have no source and cannot have one: the asset pipeline is
   * Phase 14's, and a URL to a real file would make these screenshots depend on
   * a network. What is photographed is the state a user meets first, which is
   * the empty box the editor keeps so the component can be selected and fixed.
   */
  {
    id: "media-without-a-source",
    covers: ["core.image", "core.video"],
    document: () =>
      pageOf(
        [
          { id: "section", type: "core.section", children: ["image", "video"] },
          { id: "image", type: "core.image", props: { alt: "", decorative: true } },
          { id: "video", type: "core.video" },
        ],
        ["section"],
      ),
  },
]
