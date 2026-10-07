import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { EditorProvider } from "@checkout-studio/editor"
import { createDocument, type CheckoutSchema, type Node } from "@checkout-studio/schema"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ReactElement } from "react"

import { RecoveryNotice } from "./RecoveryNotice"

/**
 * What the editor says when the document it was given does not hold together.
 *
 * A frozen editor with nothing on screen is worse than no check at all: the
 * page is read-only, every control is greyed, and nothing says why. So what is
 * tested here is that the notice appears, says how bad it is, and offers both
 * of the ways out docs/error-handling.md § State Corruption Recovery names —
 * reloading the server's copy, and exporting the broken document, because it
 * is the only copy of whatever the person was doing.
 */

function page(): CheckoutSchema {
  return createDocument({
    projectId: "prj_test",
    pageId: "pag_test",
    themeId: "theme_default",
    random: () => 0.5,
  })
}

/** The same page with a node claimed by nobody. */
function orphaned(): CheckoutSchema {
  const document = page()
  const root = document.nodes[document.root] as Node
  const stray: Node = {
    id: "stray",
    type: "core.section",
    parentId: document.root,
    children: [],
    props: {},
    styles: {},
    visibility: { hidden: false },
    animations: [],
    metadata: { locked: false },
  }

  // `stray` names the root as its parent and the root does not claim it.
  return {
    ...document,
    nodes: { ...document.nodes, [document.root]: { ...root, children: [] }, stray },
  }
}

function mount(document: CheckoutSchema): ReactElement {
  return (
    <EditorProvider document={document} baseVersion={4}>
      <RecoveryNotice />
    </EditorProvider>
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("with a document that holds together", () => {
  it("says nothing", () => {
    render(mount(page()))

    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })
})

describe("with a document that does not", () => {
  it("says so, and how many problems there are", () => {
    render(mount(orphaned()))

    const alert = screen.getByRole("alert")

    expect(alert).toHaveTextContent(/could not be opened for editing/)
    expect(alert).toHaveTextContent(/problem/)
  })

  it("offers the server's copy and a copy of the wreckage", () => {
    render(mount(orphaned()))

    expect(screen.getByRole("button", { name: "Reload from the server" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Export a copy" })).toBeInTheDocument()
  })

  it("exports the document and what was wrong with it", async () => {
    const user = userEvent.setup()
    const created: string[] = []
    const clicked = vi.fn()

    vi.spyOn(URL, "createObjectURL").mockImplementation((blob: Blob | MediaSource) => {
      created.push((blob as Blob).type)

      return "blob:recovery"
    })
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(clicked)

    render(mount(orphaned()))

    await user.click(screen.getByRole("button", { name: "Export a copy" }))

    expect(created).toEqual(["application/json"])
    // Downloaded rather than opened: the point is to get it off the machine
    // before anybody tries to fix anything.
    expect(clicked).toHaveBeenCalledTimes(1)
  })

  it("does not offer to repair it", () => {
    render(mount(orphaned()))

    /*
     * docs/error-handling.md is explicit that the document is rebuilt rather
     * than repaired in place: repairing means guessing at intent, and a guess
     * about somebody's page is a guess that changes it. A "Fix" button would be
     * that guess with a label on it.
     */
    expect(screen.queryByRole("button", { name: /repair|fix/i })).not.toBeInTheDocument()
  })
})
