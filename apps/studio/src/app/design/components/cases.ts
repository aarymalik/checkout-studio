import type { CartItem, Quote } from "@checkout-studio/plugin-checkout"
import type { RenderMode } from "@checkout-studio/plugin-sdk"
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
  /**
   * Which mode to draw in. `published` unless the case says otherwise.
   *
   * On the case rather than in the renderer, which used to ask
   * `id === "media-without-a-source"`. A second case needing the editor is
   * what showed that up: the question "which mode is this case about" belongs
   * beside the case, not in an expression naming one of them.
   */
  mode?: RenderMode
  /**
   * The quote to draw this case with.
   *
   * A checkout component shows numbers a server returned, so a case without
   * one photographs the "working out your total" state — true, and not what a
   * picture of an Order Summary is for. Supplied here rather than fetched,
   * because a screenshot that depended on a request would be a screenshot that
   * depended on timing.
   */
  quote?: Quote
  /**
   * What is in the cart before anything renders.
   *
   * A Product Card puts its own product in, so a page with one needs nothing
   * here. A page without one does: an Order Summary photographed beside an
   * empty cart draws "Nothing in your order yet", which is correct and is not
   * what a picture of a summary is for.
   */
  cart?: readonly CartItem[]
  /** The page this case draws. */
  document: () => CheckoutSchema
}

/*
 * A product photograph, as a data URI.
 *
 * A screenshot that fetched an image would be a screenshot that depended on a
 * network, and the visual job runs without one. This is drawn by the browser
 * from the bytes in this file, so every platform draws the same square.
 */
// A stand-in product photograph. Nothing in the product is drawn in these.
// design-system-ignore: photograph bytes, not interface colour.
const WALLET_LEATHER = "#8b5e34"
// design-system-ignore: the darker panel of the same photograph.
const WALLET_PANEL = "#6b4423"

const WALLET =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">' +
      `<rect width="80" height="80" fill="${WALLET_LEATHER}"/>` +
      `<rect x="12" y="30" width="56" height="26" rx="3" fill="${WALLET_PANEL}"/>` +
      "</svg>",
  )

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
    mode: "editor-preview",
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
  /*
   * An HTML Block holding what a merchant would put in one.
   *
   * The tree is written out rather than parsed from markup, because the
   * parser is the editor's and this file is read by the renderer's gallery —
   * and because this is the shape the component actually stores. What a
   * screenshot of it proves is that a stored tree becomes the elements it
   * says it is, with the theme's type and spacing applied to them.
   */
  {
    id: "merchant-markup",
    covers: ["core.html-block"],
    document: () =>
      pageOf(
        [
          { id: "section", type: "core.section", children: ["html"] },
          {
            id: "html",
            type: "core.html-block",
            props: {
              content: [
                { tag: "h2", children: [{ text: "Returns" }] },
                {
                  tag: "p",
                  children: [
                    { text: "Thirty days, " },
                    { tag: "strong", children: [{ text: "no questions" }] },
                    { text: ". Read the " },
                    { tag: "a", attrs: { href: "/terms" }, children: [{ text: "terms" }] },
                    { text: "." },
                  ],
                },
                {
                  tag: "ul",
                  children: [
                    { tag: "li", children: [{ text: "Unworn, in its box" }] },
                    { tag: "li", children: [{ text: "Proof of purchase" }] },
                  ],
                },
              ],
            },
          },
        ],
        ["section"],
      ),
  },
  /*
   * A Code Block, with a stylesheet of its own.
   *
   * The rules are written out rather than parsed, for the reason the tree
   * above is: the parser is the editor's, and this is the shape the component
   * stores. What a screenshot of it proves is the part no unit test reaches —
   * that a merchant's rule is in the page's stylesheet, scoped to this node,
   * and that the theme's typography is underneath it.
   */
  {
    id: "merchant-css",
    covers: ["core.code-block"],
    document: () =>
      pageOf(
        [
          { id: "section", type: "core.section", children: ["code"] },
          {
            id: "code",
            type: "core.code-block",
            props: {
              content: [
                { tag: "h2", children: [{ text: "Delivery" }] },
                {
                  tag: "p",
                  attrs: { class: "lead" },
                  children: [{ text: "Free over £50, next day before 2pm." }],
                },
                { tag: "p", children: [{ text: "Everything else arrives within three days." }] },
              ],
              styles: [
                // A merchant's own CSS, where a literal is the point.
                // design-system-ignore: this is what somebody types into a block.
                { selector: ".lead", declarations: { fontWeight: "600", color: "#4f46e5" } },
                { selector: "h2", declarations: { textTransform: "uppercase" } },
              ],
            },
          },
        ],
        ["section"],
      ),
  },
  /*
   * Embeds, photographed as the editor draws them.
   *
   * `editor-preview` rather than published, and that is the point rather than
   * a convenience: a published embed is a frame holding somebody else's page,
   * so a screenshot of one would be a screenshot of YouTube — different every
   * time it changes, and a test that fails when a third party redesigns.
   *
   * What is ours is the box: its ratio, its surface, and the fact that the
   * editor draws it without calling the provider.
   */
  {
    id: "embeds",
    covers: ["core.embed"],
    mode: "editor-preview",
    document: () =>
      pageOf(
        [
          { id: "section", type: "core.section", children: ["video", "booking", "empty"] },
          {
            id: "video",
            type: "core.embed",
            props: { provider: "youtube", id: "dQw4w9WgXcQ", title: "How it works" },
          },
          {
            id: "booking",
            type: "core.embed",
            props: { provider: "calendly", id: "acme/intro-call" },
            styles: { desktop: { base: { aspectRatio: "4 / 3" } } },
          },
          { id: "empty", type: "core.embed", props: { provider: "vimeo", id: "" } },
        ],
        ["section"],
      ),
  },
  /*
   * Form fields, in the editor.
   *
   * `editor-preview` because that is the state this case is about: a field on
   * the canvas is read-only rather than disabled, so a merchant can see it
   * without typing into a form that goes nowhere. What a published one does —
   * remembering, checking, announcing — is behaviour, and lives in the
   * plugin's tests rather than in a photograph.
   */
  {
    id: "fields",
    covers: ["core.input"],
    mode: "editor-preview",
    document: () =>
      pageOf(
        [
          { id: "section", type: "core.section", children: ["email", "phone", "qty"] },
          {
            id: "email",
            type: "core.input",
            props: {
              label: "Email address",
              kind: "email",
              required: true,
              placeholder: "name@example.com",
            },
          },
          {
            id: "phone",
            type: "core.input",
            props: { label: "Phone", kind: "tel", help: "Only if something goes wrong." },
          },
          { id: "qty", type: "core.input", props: { label: "Quantity", kind: "number", min: 1 } },
        ],
        ["section"],
      ),
  },
  /*
   * The fields whose answer is a choice, and the multi-line one.
   *
   * `editor-preview` for the reason the case above is: what a published field
   * does — remembering, checking, announcing — is behaviour and lives in the
   * plugin's tests. What a picture is for is the shape of the control, and in
   * particular the radio group's, whose label is a `<legend>` and therefore
   * the one most likely to be laid out wrongly without anybody noticing.
   */
  {
    id: "choices",
    covers: ["core.textarea", "core.select", "core.checkbox", "core.radio-group"],
    mode: "editor-preview",
    document: () =>
      pageOf(
        [
          {
            id: "section",
            type: "core.section",
            children: ["notes", "delivery", "method", "terms"],
          },
          {
            id: "notes",
            type: "core.textarea",
            props: { label: "Delivery notes", rows: 3, placeholder: "Leave it with a neighbour" },
          },
          {
            id: "delivery",
            type: "core.select",
            props: {
              label: "Delivery",
              required: true,
              options: [
                { value: "standard", label: "Standard — 3 days" },
                { value: "express", label: "Express — next day" },
              ],
            },
          },
          {
            id: "method",
            type: "core.radio-group",
            props: {
              label: "How should we contact you?",
              required: true,
              options: [
                { value: "email", label: "Email" },
                { value: "sms", label: "Text message" },
              ],
            },
          },
          {
            id: "terms",
            type: "core.checkbox",
            props: { label: "Email me about this order", help: "This order only." },
          },
        ],
        ["section"],
      ),
  },
  /*
   * An address and a country, which are the two composite shapes.
   *
   * Worth a picture of its own: an address is five controls that arrive as one
   * component, and whether they read as one thing is a question about the page
   * rather than about any of them. The country offers two, because what the
   * published page carries is the countries the merchant chose.
   */
  {
    id: "address",
    covers: ["core.address", "core.country"],
    mode: "editor-preview",
    document: () =>
      pageOf(
        [
          { id: "section", type: "core.section", children: ["where", "ship"] },
          { id: "where", type: "core.address", props: { required: true } },
          {
            id: "ship",
            type: "core.country",
            props: {
              label: "Country",
              required: true,
              options: [
                { value: "GB", label: "United Kingdom" },
                { value: "IE", label: "Ireland" },
              ],
            },
          },
        ],
        ["section"],
      ),
  },
  {
    id: "products",
    covers: ["checkout.product-card", "checkout.product-list"],
    quote: {
      quoteId: "qt_products",
      signature: "sig",
      expiresAt: "2099-01-01T00:00:00.000Z",
      currency: "GBP",
      lineItems: [
        {
          nodeId: "wallet",
          kind: "product",
          label: "Leather Wallet",
          quantity: 1,
          unitAmount: 3900,
          amount: 3900,
        },
        {
          nodeId: "belt",
          kind: "product",
          label: "Woven Belt",
          quantity: 2,
          unitAmount: 2400,
          amount: 4800,
        },
        {
          nodeId: "polish",
          kind: "product",
          label: "Leather Balm",
          quantity: 1,
          unitAmount: 900,
          amount: 900,
        },
      ],
      subtotal: 9600,
      discount: 0,
      shipping: 0,
      tax: 0,
      total: 9600,
      notices: [],
    },
    document: () =>
      pageOf(
        [
          { id: "section", type: "core.section", children: ["list"] },
          {
            id: "list",
            type: "checkout.product-list",
            children: ["wallet", "belt", "polish"],
          },
          {
            id: "wallet",
            type: "checkout.product-card",
            props: {
              title: "Leather Wallet",
              description: "Full grain, four card slots.",
              price: 4500,
              sku: "LW-01",
              image: WALLET,
              imageAlt: "",
            },
          },
          {
            id: "belt",
            type: "checkout.product-card",
            props: {
              title: "Woven Belt",
              description: "Elastic weave, leather tab.",
              price: 2400,
              quantity: 2,
              inventory: 3,
            },
          },
          {
            id: "polish",
            type: "checkout.product-card",
            props: { title: "Leather Balm", price: 900, sku: "LB-04" },
          },
        ],
        ["section"],
      ),
  },
  {
    id: "coupon",
    covers: ["checkout.coupon"],
    /*
     * Idle, which is the state a merchant sees when they drop one on a page
     * and the only one with a field and a button in it. Applied and refused
     * both need somebody to type, and a screenshot of either would be a
     * screenshot of a cart this gallery had arranged rather than of a
     * component — the unit tests cover them.
     */
    cart: [{ nodeId: "summary", quantity: 1 }],
    quote: {
      quoteId: "qt_coupon",
      signature: "sig",
      expiresAt: "2099-01-01T00:00:00.000Z",
      currency: "GBP",
      lineItems: [],
      subtotal: 4998,
      discount: 500,
      shipping: 0,
      tax: 0,
      total: 4498,
      notices: [],
    },
    document: () =>
      pageOf(
        [
          { id: "section", type: "core.section", children: ["cpn", "summary"] },
          { id: "cpn", type: "checkout.coupon" },
          { id: "summary", type: "checkout.order-summary" },
        ],
        ["section"],
      ),
  },
  {
    id: "order-bump",
    covers: ["checkout.order-bump"],
    /*
     * Not taken, which is the state every customer meets first and the one
     * with the dashed border and the badge in it. Accepted needs somebody to
     * tick it; the unit tests cover what changes when they do.
     */
    cart: [{ nodeId: "summary", quantity: 1 }],
    quote: {
      quoteId: "qt_bump",
      signature: "sig",
      expiresAt: "2099-01-01T00:00:00.000Z",
      currency: "GBP",
      lineItems: [],
      subtotal: 4998,
      discount: 0,
      shipping: 0,
      tax: 0,
      total: 4998,
      notices: [],
    },
    document: () =>
      pageOf(
        [
          { id: "section", type: "core.section", children: ["bump", "summary"] },
          { id: "bump", type: "checkout.order-bump" },
          { id: "summary", type: "checkout.order-summary" },
        ],
        ["section"],
      ),
  },
  {
    id: "shipping-and-tax",
    covers: ["checkout.shipping-selector", "checkout.tax-summary"],
    cart: [{ nodeId: "summary", quantity: 1 }],
    quote: {
      quoteId: "qt_delivery",
      signature: "sig",
      expiresAt: "2099-01-01T00:00:00.000Z",
      currency: "GBP",
      lineItems: [
        {
          nodeId: "vat",
          kind: "tax",
          label: "VAT 20%",
          quantity: 1,
          unitAmount: 980,
          amount: 980,
        },
      ],
      shippingMethods: [
        { id: "std", label: "Standard", amount: 0, description: "Three to five days" },
        { id: "exp", label: "Express", amount: 599, description: "Next working day" },
      ],
      shippingMethodId: "std",
      subtotal: 4898,
      discount: 0,
      shipping: 0,
      tax: 980,
      total: 5878,
      notices: [],
    },
    document: () =>
      pageOf(
        [
          { id: "section", type: "core.section", children: ["ship", "tax", "summary"] },
          { id: "ship", type: "checkout.shipping-selector" },
          { id: "tax", type: "checkout.tax-summary", props: { note: "Charged at the UK rate." } },
          { id: "summary", type: "checkout.order-summary" },
        ],
        ["section"],
      ),
  },
  {
    id: "order-summary",
    covers: ["checkout.order-summary"],
    cart: [{ nodeId: "summary", quantity: 1 }],
    quote: {
      quoteId: "qt_gallery",
      signature: "sig",
      expiresAt: "2099-01-01T00:00:00.000Z",
      currency: "GBP",
      lineItems: [],
      subtotal: 4998,
      discount: 500,
      shipping: 399,
      tax: 980,
      total: 5877,
      notices: [],
    },
    document: () =>
      pageOf(
        [
          { id: "section", type: "core.section", children: ["summary"] },
          { id: "summary", type: "checkout.order-summary" },
        ],
        ["section"],
      ),
  },
]
