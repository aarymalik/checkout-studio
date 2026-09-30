import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import type { ReactNode } from "react"

import {
  EditorProvider,
  useEditorActions,
  useEditorStore,
  useEditorStoreApi,
} from "../../src/state/context"
import { sampleDocument } from "./support"

/**
 * The store, through React.
 *
 * One store per editor, kept for the life of the mount, and subscribed to
 * through selectors — the two properties that keep undo history from vanishing
 * and the canvas from re-rendering whenever anything changes.
 */

function Title(): ReactNode {
  const text = useEditorStore((state) => state.document.nodes["heading"]?.props["text"] ?? "none")

  return <span data-testid="title">{String(text)}</span>
}

/** Counts its own renders, so an unrelated change showing up here is visible. */
function Zoom({ onRender }: { onRender: () => void }): ReactNode {
  const zoom = useEditorStore((state) => state.viewport.zoom)
  onRender()

  return <span data-testid="zoom">{zoom}</span>
}

function Editor({ children }: { children: ReactNode }): ReactNode {
  return <EditorProvider document={sampleDocument()}>{children}</EditorProvider>
}

describe("EditorProvider", () => {
  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("makes the document readable", () => {
    render(
      <Editor>
        <Title />
      </Editor>,
    )

    expect(screen.getByTestId("title")).toHaveTextContent("none")
  })

  it("re-renders a subscriber when what it reads changes", async () => {
    function Editing(): ReactNode {
      const actions = useEditorActions()

      return (
        <>
          <Title />
          <button type="button" onClick={() => actions().setProps("heading", { text: "Hello" })}>
            edit
          </button>
        </>
      )
    }

    const user = userEvent.setup()
    render(
      <Editor>
        <Editing />
      </Editor>,
    )

    await user.click(screen.getByRole("button", { name: "edit" }))

    expect(screen.getByTestId("title")).toHaveTextContent("Hello")
  })

  /*
   * The failure docs/state-management.md § Re-render Strategy is about:
   * updating one button must never re-render the whole canvas.
   */
  it("does not re-render a subscriber whose slice did not change", async () => {
    let renders = 0

    function Editing(): ReactNode {
      const actions = useEditorActions()

      return (
        <>
          <Zoom onRender={() => (renders += 1)} />
          <button type="button" onClick={() => actions().setProps("heading", { text: "Hello" })}>
            edit
          </button>
        </>
      )
    }

    const user = userEvent.setup()
    render(
      <Editor>
        <Editing />
      </Editor>,
    )

    const before = renders

    await user.click(screen.getByRole("button", { name: "edit" }))

    expect(renders).toBe(before)
  })

  // A store rebuilt on re-render would lose history, selection and everything
  // else that is not the document — silently.
  it("keeps one store across re-renders", async () => {
    function Editing(): ReactNode {
      const actions = useEditorActions()
      const past = useEditorStore((state) => state.history.past.length)

      return (
        <>
          <span data-testid="past">{past}</span>
          <button type="button" onClick={() => actions().setProps("heading", { text: "Hello" })}>
            edit
          </button>
          <button type="button" onClick={() => actions().setZoom(Math.random())}>
            zoom
          </button>
        </>
      )
    }

    const user = userEvent.setup()
    render(
      <Editor>
        <Editing />
      </Editor>,
    )

    await user.click(screen.getByRole("button", { name: "edit" }))
    await user.click(screen.getByRole("button", { name: "zoom" }))
    await user.click(screen.getByRole("button", { name: "zoom" }))

    expect(screen.getByTestId("past")).toHaveTextContent("1")
  })

  it("hands out the store itself for a caller that needs to act", () => {
    function Peek(): ReactNode {
      const store = useEditorStoreApi()

      return <span data-testid="root">{store.getState().document.root}</span>
    }

    render(
      <Editor>
        <Peek />
      </Editor>,
    )

    expect(screen.getByTestId("root")).toHaveTextContent("root")
  })

  it("throws a useful error outside a provider", () => {
    expect(() => render(<Title />)).toThrow("inside an <EditorProvider>")
  })

  it("keeps the actions stable, so a component that only acts never re-renders", () => {
    const seen: unknown[] = []

    function Acting(): ReactNode {
      const actions = useEditorActions()
      seen.push(actions)
      const zoom = useEditorStore((state) => state.viewport.zoom)

      return <span data-testid="zoom">{zoom}</span>
    }

    const { rerender } = render(
      <Editor>
        <Acting />
      </Editor>,
    )

    rerender(
      <Editor>
        <Acting />
      </Editor>,
    )

    expect(seen.length).toBeGreaterThan(1)
    expect(new Set(seen).size).toBe(1)
  })

  it("applies the options it was given", () => {
    function Peek(): ReactNode {
      const version = useEditorStore((state) => state.persistence.baseVersion)

      return <span data-testid="version">{version}</span>
    }

    render(
      <EditorProvider document={sampleDocument()} baseVersion={12}>
        <Peek />
      </EditorProvider>,
    )

    expect(screen.getByTestId("version")).toHaveTextContent("12")
  })
})

describe("acting on the store", () => {
  it("undoes through the provider", async () => {
    function Editing(): ReactNode {
      const actions = useEditorActions()

      return (
        <>
          <Title />
          <button type="button" onClick={() => actions().setProps("heading", { text: "Hello" })}>
            edit
          </button>
          <button type="button" onClick={() => actions().undo()}>
            undo
          </button>
        </>
      )
    }

    const user = userEvent.setup()
    render(
      <Editor>
        <Editing />
      </Editor>,
    )

    await user.click(screen.getByRole("button", { name: "edit" }))
    await user.click(screen.getByRole("button", { name: "undo" }))

    expect(screen.getByTestId("title")).toHaveTextContent("none")
  })

  it("survives a change made outside React", () => {
    let api: ReturnType<typeof useEditorStoreApi> | null = null

    function Peek(): ReactNode {
      api = useEditorStoreApi()

      return <Title />
    }

    render(
      <Editor>
        <Peek />
      </Editor>,
    )

    act(() => {
      api?.getState().setProps("heading", { text: "Outside" })
    })

    expect(screen.getByTestId("title")).toHaveTextContent("Outside")
  })
})
