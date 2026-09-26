import { render, screen } from "@testing-library/react"
import { Inbox } from "lucide-react"
import { describe, expect, it } from "vitest"
import { Button } from "../primitives/Button"
import { EmptyState } from "./EmptyState"
import { expectNoViolations } from "../../tests/axe"

describe("EmptyState", () => {
  it("says what is missing", () => {
    render(<EmptyState title="No pages yet" />)

    expect(screen.getByText("No pages yet")).toBeInTheDocument()
  })

  it("explains, so an empty list does not read as a failure", () => {
    render(<EmptyState title="No pages yet" description="Create one to get started." />)

    expect(screen.getByText("Create one to get started.")).toBeInTheDocument()
  })

  it("offers the action that resolves the emptiness", () => {
    render(<EmptyState title="No pages yet" action={<Button>New page</Button>} />)

    expect(screen.getByRole("button", { name: "New page" })).toBeInTheDocument()
  })

  it("hides its icon, which is decoration", () => {
    const { container } = render(<EmptyState icon={<Inbox />} title="No pages yet" />)

    expect(container.querySelector("span[aria-hidden]")).toBeInTheDocument()
  })

  it("reports no axe violations", async () => {
    const { container } = render(
      <EmptyState
        icon={<Inbox />}
        title="No pages yet"
        description="Create one to get started."
        action={<Button>New page</Button>}
      />,
    )

    await expectNoViolations(container)
  })
})
