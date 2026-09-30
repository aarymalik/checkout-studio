import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactNode } from "react"

import { RenderNode } from "../src/runtime/RenderNode"
import { planTree } from "../src/runtime/plan"
import { clearThemeCache } from "../src/theme/compile"
import {
  Box,
  Leaf,
  contextFor,
  deepDocument,
  definition,
  documentOf,
  registryWith,
  sampleDocument,
  wideDocument,
} from "./support"

beforeEach(() => {
  clearThemeCache()
})

/** Swallows the boundary's console noise so a deliberate throw does not look like a failure. */
function quietly(body: () => void): void {
  const error = vi.spyOn(console, "error").mockImplementation(() => {})

  try {
    body()
  } finally {
    error.mockRestore()
  }
}

describe("rendering a tree", () => {
  it("renders a single node", () => {
    const document = documentOf("only", [{ id: "only", type: "core.text", props: { text: "Hi" } }])

    render(<RenderNode nodeId="only" context={contextFor(document)} />)

    expect(screen.getByText("Hi")).toBeInTheDocument()
  })

  it("renders a nested tree", () => {
    const { container } = render(
      <RenderNode nodeId="page" context={contextFor(sampleDocument())} />,
    )

    expect(container.querySelector(".ck-page .ck-section .ck-text")).not.toBeNull()
  })

  it("renders a hundred levels without a depth limit", () => {
    const document = deepDocument(100)

    const { container } = render(<RenderNode nodeId="n0" context={contextFor(document)} />)

    expect(container.querySelector(".ck-n99")).not.toBeNull()
    expect(screen.getByText("99")).toBeInTheDocument()
  })

  it("renders a single-node tree with no children", () => {
    const document = documentOf("page", [{ id: "page", type: "core.page" }])

    const { container } = render(<RenderNode nodeId="page" context={contextFor(document)} />)

    expect(container.querySelector(".ck-page")?.children).toHaveLength(0)
  })

  it("renders children in stored order", () => {
    const document = wideDocument(4)

    const { container } = render(<RenderNode nodeId="page" context={contextFor(document)} />)

    expect(
      [...(container.querySelector(".ck-page")?.children ?? [])].map((c) => c.textContent),
    ).toEqual(["t0", "t1", "t2", "t3"])
  })

  it("reorders when the document reorders, and not otherwise", () => {
    const document = wideDocument(3)
    const reversed = {
      ...document,
      nodes: {
        ...document.nodes,
        page: { ...document.nodes["page"]!, children: ["t2", "t1", "t0"] },
      },
    }

    const { container } = render(<RenderNode nodeId="page" context={contextFor(reversed)} />)

    expect(container.textContent).toBe("t2t1t0")
  })

  it("renders nothing for a child id with no node", () => {
    const document = documentOf("page", [{ id: "page", type: "core.page", children: ["gone"] }])

    const { container } = render(<RenderNode nodeId="page" context={contextFor(document)} />)

    expect(container.querySelector(".ck-page")?.children).toHaveLength(0)
  })

  it("renders nothing at all for a root that does not exist", () => {
    const { container } = render(
      <RenderNode nodeId="nowhere" context={contextFor(sampleDocument())} />,
    )

    expect(container.innerHTML).toBe("")
  })

  it("renders no children for a component that does not hold them", () => {
    const document = documentOf("page", [
      { id: "page", type: "core.text", children: ["child"] },
      { id: "child", type: "core.text", props: { text: "orphaned" } },
    ])

    render(<RenderNode nodeId="page" context={contextFor(document)} />)

    // A document can say anything — it may have been imported, or authored
    // against a version where the component did take children.
    expect(screen.queryByText("orphaned")).toBeNull()
  })
})

describe("component resolution", () => {
  it("falls back to an unsupported placeholder for an unknown type", () => {
    const document = documentOf("page", [{ id: "page", type: "checkout.coupon" }])
    const context = contextFor(document)

    const { container } = render(<RenderNode nodeId="page" context={context} />)

    expect(container.querySelector('[data-ck-unsupported="checkout.coupon"]')).not.toBeNull()
    expect(context.warnings()).toEqual([
      {
        code: "component-not-registered",
        nodeId: "page",
        message: 'No component is registered for "checkout.coupon".',
      },
    ])
  })

  it("shows the user what is missing in the editor, and the customer nothing", () => {
    const document = documentOf("page", [{ id: "page", type: "checkout.coupon" }])

    const editor = render(
      <RenderNode nodeId="page" context={contextFor(document, { mode: "editor-preview" })} />,
    )
    expect(editor.container.textContent).toContain("checkout.coupon")

    editor.unmount()

    const live = render(<RenderNode nodeId="page" context={contextFor(document)} />)
    expect(live.container.textContent).toBe("")
    // The space is still reserved. A page that reflowed around a missing
    // section would spend the CLS budget on an error nobody can see.
    expect(live.container.querySelector("div")).not.toBeNull()
  })

  it("recovers the node once the component is registered", () => {
    const document = documentOf("page", [{ id: "page", type: "checkout.coupon" }])

    const { container } = render(
      <RenderNode
        nodeId="page"
        context={contextFor(document, {
          registry: registryWith(definition("checkout.coupon", { renderer: Leaf })),
        })}
      />,
    )

    // Nothing was lost: the node's data sat in the document untouched.
    expect(container.querySelector("[data-ck-unsupported]")).toBeNull()
    expect(container.querySelector("span")).not.toBeNull()
  })

  it("does not render the children of an unsupported node", () => {
    const document = documentOf("page", [
      { id: "page", type: "checkout.coupon", children: ["text"] },
      { id: "text", type: "core.text", props: { text: "inside" } },
    ])

    render(<RenderNode nodeId="page" context={contextFor(document)} />)

    expect(screen.queryByText("inside")).toBeNull()
  })
})

describe("a component that throws", () => {
  function Broken(): ReactNode {
    throw new Error("could not render")
  }

  const registry = () =>
    registryWith(
      definition("core.page"),
      definition("core.broken", { name: "Broken Thing", renderer: Broken, container: false }),
      definition("core.text", { container: false, renderer: Leaf }),
    )

  const document = documentOf("page", [
    { id: "page", type: "core.page", children: ["broken", "text"] },
    { id: "broken", type: "core.broken" },
    { id: "text", type: "core.text", props: { text: "still here" } },
  ])

  it("costs its own section and nothing else", () => {
    quietly(() => {
      render(<RenderNode nodeId="page" context={contextFor(document, { registry: registry() })} />)
    })

    // A broken component costs one section. A blank page costs the whole sale.
    expect(screen.getByText("still here")).toBeInTheDocument()
  })

  it("names the component in the editor and says nothing on a live page", () => {
    quietly(() => {
      const editor = render(
        <RenderNode
          nodeId="page"
          context={contextFor(document, { registry: registry(), mode: "editor-preview" })}
        />,
      )

      expect(editor.container.textContent).toContain("Broken Thing")
      editor.unmount()

      const live = render(
        <RenderNode nodeId="page" context={contextFor(document, { registry: registry() })} />,
      )

      expect(live.container.textContent).toBe("still here")
      expect(live.container.querySelector('[data-ck-failed="Broken Thing"]')).not.toBeNull()
    })
  })

  it("reports before it renders the fallback", () => {
    const onError = vi.fn()

    quietly(() => {
      render(
        <RenderNode
          nodeId="page"
          context={contextFor(document, { registry: registry() })}
          onError={onError}
        />,
      )
    })

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0]?.[1]).toBe("broken")
    // Normalised first: a boundary that catches a string cannot say whether a
    // retry would help, and one that renders String(thrown) shows a customer a
    // stack trace.
    expect(onError.mock.calls[0]?.[0]).toMatchObject({ message: "could not render" })
  })

  it("survives a component throwing something that is not an error", () => {
    function Rude(): ReactNode {
      throw "just a string"
    }

    const onError = vi.fn()

    quietly(() => {
      render(
        <RenderNode
          nodeId="page"
          context={contextFor(documentOf("page", [{ id: "page", type: "core.rude" }]), {
            registry: registryWith(definition("core.rude", { renderer: Rude })),
          })}
          onError={onError}
        />,
      )
    })

    expect(onError).toHaveBeenCalledTimes(1)
  })
})

describe("visibility while rendering", () => {
  it("skips a hidden node and its children entirely", () => {
    const document = documentOf("page", [
      { id: "page", type: "core.page", children: ["hidden"] },
      { id: "hidden", type: "core.section", children: ["text"], visibility: { hidden: true } },
      { id: "text", type: "core.text", props: { text: "inside" } },
    ])

    const { container } = render(<RenderNode nodeId="page" context={contextFor(document)} />)

    expect(screen.queryByText("inside")).toBeNull()
    expect(container.querySelector(".ck-hidden")).toBeNull()
  })

  it("skips a node whose condition the server can decide against", () => {
    const document = documentOf("page", [
      { id: "page", type: "core.page", children: ["us-only"] },
      {
        id: "us-only",
        type: "core.text",
        props: { text: "US only" },
        visibility: { conditions: [{ source: "country", operator: "equals", value: "US" }] },
      },
    ])

    render(
      <RenderNode
        nodeId="page"
        context={contextFor(document, { conditions: { country: "DE" } })}
      />,
    )

    // A privacy property as much as a performance one: a block shown only to
    // customers in one country should not sit in everyone else's HTML.
    expect(screen.queryByText("US only")).toBeNull()
  })

  it("renders a node whose condition only the browser can decide, and marks it", () => {
    const document = documentOf("page", [
      { id: "page", type: "core.page", children: ["later"] },
      {
        id: "later",
        type: "core.text",
        props: { text: "later" },
        visibility: { conditions: [{ source: "field", operator: "exists" }] },
      },
    ])

    const { container } = render(<RenderNode nodeId="page" context={contextFor(document)} />)

    expect(container.querySelector(".ck-later.ck-deferred")).not.toBeNull()
  })

  it("renders a breakpoint-only node and hides it with CSS, never by omission", () => {
    const document = documentOf("page", [
      { id: "page", type: "core.page", children: ["wide"] },
      {
        id: "wide",
        type: "core.text",
        props: { text: "desktop only" },
        visibility: { breakpoints: ["desktop"] },
      },
    ])

    const { container } = render(<RenderNode nodeId="page" context={contextFor(document)} />)

    // Omitting it would make the HTML depend on a width the server cannot see,
    // and every visitor whose width disagreed would get a hydration mismatch.
    expect(screen.getByText("desktop only")).toBeInTheDocument()
    expect(container.querySelector(".ck-wide.ck-hide-tablet.ck-hide-mobile")).not.toBeNull()
  })

  it("hides it with one class on the canvas, where the device is known", () => {
    const document = documentOf("page", [
      { id: "page", type: "core.page", children: ["wide"] },
      { id: "wide", type: "core.text", visibility: { breakpoints: ["desktop"] } },
    ])

    const { container } = render(
      <RenderNode
        nodeId="page"
        context={contextFor(document, { mode: "editor-preview", breakpoint: "mobile" })}
      />,
    )

    expect(container.querySelector(".ck-wide.ck-hide")).not.toBeNull()
  })
})

describe("what a component receives", () => {
  it("gets the node, its class, the mode, and its resolved props", () => {
    const seen: ComponentRenderProps[] = []

    function Spy(props: ComponentRenderProps): ReactNode {
      seen.push(props)
      return <Box {...props} />
    }

    const document = documentOf("page", [{ id: "page", type: "core.spy", props: { label: "Pay" } }])

    render(
      <RenderNode
        nodeId="page"
        context={contextFor(document, {
          registry: registryWith(
            definition("core.spy", { renderer: Spy, defaultProps: { size: "md" } }),
          ),
        })}
      />,
    )

    expect(seen).toHaveLength(1)
    expect(seen[0]?.node.id).toBe("page")
    expect(seen[0]?.className).toBe("ck-page")
    expect(seen[0]?.mode).toBe("published")
    expect(seen[0]?.props).toEqual({ size: "md", label: "Pay" })
  })
})

describe("the plan both walks share", () => {
  it("lists every node that will render, in document order", () => {
    expect(planTree(contextFor(sampleDocument())).map((plan) => plan.node.id)).toEqual([
      "page",
      "section",
      "text",
    ])
  })

  it("leaves out a hidden subtree", () => {
    const document = documentOf("page", [
      { id: "page", type: "core.page", children: ["a", "b"] },
      { id: "a", type: "core.section", children: ["a1"], visibility: { hidden: true } },
      { id: "a1", type: "core.text" },
      { id: "b", type: "core.text" },
    ])

    expect(planTree(contextFor(document)).map((plan) => plan.node.id)).toEqual(["page", "b"])
  })

  it("leaves out the children of a component that does not hold them", () => {
    const document = documentOf("page", [
      { id: "page", type: "core.text", children: ["child"] },
      { id: "child", type: "core.text" },
    ])

    expect(planTree(contextFor(document)).map((plan) => plan.node.id)).toEqual(["page"])
  })

  it("keeps walking past a node with no component, since its type may return", () => {
    const document = documentOf("page", [
      { id: "page", type: "core.page", children: ["unknown"] },
      { id: "unknown", type: "checkout.coupon", children: ["text"] },
      { id: "text", type: "core.text" },
    ])

    const plans = planTree(contextFor(document))

    expect(plans.map((plan) => plan.node.id)).toEqual(["page", "unknown", "text"])
    expect(plans[1]?.definition).toBeNull()
  })

  it("walks depth-first, so a node's rules sit next to its children's", () => {
    const document = documentOf("page", [
      { id: "page", type: "core.page", children: ["a", "b"] },
      { id: "a", type: "core.section", children: ["a1", "a2"] },
      { id: "a1", type: "core.text" },
      { id: "a2", type: "core.text" },
      { id: "b", type: "core.text" },
    ])

    expect(planTree(contextFor(document)).map((plan) => plan.node.id)).toEqual([
      "page",
      "a",
      "a1",
      "a2",
      "b",
    ])
  })
})
