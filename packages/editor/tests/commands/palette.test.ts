import { beforeEach, describe, expect, it, vi } from "vitest"

import { CommandRegistry } from "../../src/commands/registry"
import { PaletteRegistry, createCommandSource } from "../../src/commands/palette"
import type { PaletteResult, PaletteSource } from "../../src/commands/palette"
import { makeCommand, makeContext } from "../support"

function result(overrides: Partial<PaletteResult> & Pick<PaletteResult, "id">): PaletteResult {
  return {
    title: overrides.id,
    group: "Test",
    indices: [],
    score: 0,
    isAvailable: true,
    run: () => undefined,
    ...overrides,
  }
}

describe("PaletteRegistry", () => {
  let commands: CommandRegistry
  let palette: PaletteRegistry

  beforeEach(() => {
    commands = new CommandRegistry()
    palette = new PaletteRegistry()
    commands.registerAll([
      makeCommand({ id: "edit.duplicate", title: "Duplicate", category: "edit" }),
      makeCommand({ id: "arrange.ungroup", title: "Ungroup", category: "arrange" }),
      makeCommand({ id: "arrange.group", title: "Group", category: "arrange" }),
      makeCommand({
        id: "edit.remove",
        title: "Remove",
        category: "edit",
        keywords: ["delete", "trash"],
      }),
      makeCommand({
        id: "publish.publish",
        title: "Publish",
        category: "publish",
        isAvailable: () => false,
      }),
    ])
    palette.register(createCommandSource({ commands }))
  })

  describe("searching commands", () => {
    it("finds a command by a fragment of its name", () => {
      const results = palette.search("dup", makeContext())

      expect(results[0]?.title).toBe("Duplicate")
    })

    it("ranks a prefix above a match in the middle", () => {
      const titles = palette.search("group", makeContext()).map((entry) => entry.title)

      expect(titles).toEqual(["Group", "Ungroup"])
    })

    it("finds a command by a keyword it does not say in its name", () => {
      const results = palette.search("trash", makeContext())

      expect(results.map((entry) => entry.title)).toContain("Remove")
    })

    // A keyword hit is a weaker signal than a name hit, and must not outrank one.
    it("ranks a keyword match below a name match", () => {
      commands.register(makeCommand({ id: "edit.trash-can", title: "Trash can" }))

      const titles = palette.search("trash", makeContext()).map((entry) => entry.title)

      expect(titles).toEqual(["Trash can", "Remove"])
    })

    it("lists everything on an empty query", () => {
      expect(palette.search("", makeContext())).toHaveLength(5)
    })

    it("returns nothing when nothing matches", () => {
      expect(palette.search("zzzz", makeContext())).toEqual([])
    })

    it("reports which characters matched, for highlighting", () => {
      const results = palette.search("dup", makeContext())

      expect(results[0]?.indices).toEqual([0, 1, 2])
    })

    it("groups by category, under a name a person would recognise", () => {
      const results = palette.search("group", makeContext())

      expect(results[0]?.group).toBe("Arrange")
    })

    // Greyed rather than hidden, so the list does not rearrange itself as the
    // selection changes — but never above something that can actually run.
    it("keeps unavailable commands, and sorts them last", () => {
      const results = palette.search("", makeContext())

      expect(results.at(-1)?.title).toBe("Publish")
      expect(results.at(-1)?.isAvailable).toBe(false)
    })

    it("breaks a score tie by name, so the order never wobbles", () => {
      const registry = new CommandRegistry()
      registry.registerAll([
        makeCommand({ id: "b", title: "Same" }),
        makeCommand({ id: "a", title: "Same" }),
      ])
      const source = new PaletteRegistry()
      source.register(createCommandSource({ commands: registry }))

      expect(source.search("same", makeContext()).map((entry) => entry.id)).toEqual(["b", "a"])
    })

    it("runs the command it was asked to run, with the context it searched in", () => {
      const run = vi.fn()
      commands.register(makeCommand({ id: "file.save", title: "Save now", run }))
      const context = makeContext({ isDirty: true })

      void palette.search("save", context)[0]?.run()

      expect(run).toHaveBeenCalledWith(context)
    })

    it("shows the shortcut beside a command that has one", () => {
      const withLabels = new PaletteRegistry()
      withLabels.register(
        createCommandSource({
          commands,
          shortcutFor: (id) => (id === "edit.duplicate" ? "⌘D" : null),
        }),
      )

      const results = withLabels.search("dup", makeContext())

      expect(results[0]?.hint).toBe("⌘D")
    })

    it("omits the hint entirely when there is no shortcut", () => {
      expect(palette.search("dup", makeContext())[0]).not.toHaveProperty("hint")
    })

    it("caps how many results it returns", () => {
      expect(palette.search("", makeContext(), 2)).toHaveLength(2)
    })
  })

  describe("filters", () => {
    const pages: PaletteSource = {
      id: "pages",
      prefix: "#",
      label: "Pages",
      search: (term) =>
        term === "" || "checkout".includes(term) ? [result({ id: "checkout" })] : [],
    }

    it("searches every source when no filter is given", () => {
      palette.register(pages)

      const ids = palette.search("", makeContext()).map((entry) => entry.id)

      expect(ids).toContain("checkout")
      expect(ids).toContain("edit.duplicate")
    })

    it("narrows to one source when its prefix is used", () => {
      palette.register(pages)

      const ids = palette.search("#", makeContext()).map((entry) => entry.id)

      expect(ids).toEqual(["checkout"])
    })

    it("strips the prefix from the search term", () => {
      palette.register(pages)

      expect(palette.search("# check", makeContext())).toHaveLength(1)
    })

    it("narrows to commands on >", () => {
      palette.register(pages)

      const ids = palette.search("> dup", makeContext()).map((entry) => entry.id)

      expect(ids).toEqual(["edit.duplicate"])
    })

    // Somebody searching for ":hover" with no node source registered is
    // searching for ":hover", not using a filter that does not exist.
    it("treats an unregistered prefix as ordinary text", () => {
      const parsed = palette.parse(":hover")

      expect(parsed.source).toBeNull()
      expect(parsed.term).toBe(":hover")
    })

    it("parses an empty input as an unfiltered search", () => {
      expect(palette.parse("")).toEqual({ source: null, term: "" })
    })

    it("tolerates leading whitespace before a prefix", () => {
      palette.register(pages)

      expect(palette.parse("  # check").source?.id).toBe("pages")
    })

    it("lists the sources it knows about, for the filter hints", () => {
      palette.register(pages)

      expect(palette.all().map((source) => source.prefix)).toEqual([">", "#"])
    })

    it("stops searching a source once it is disposed", () => {
      const disposable = palette.register(pages)
      disposable.dispose()

      expect(palette.search("#", makeContext()).map((entry) => entry.id)).not.toContain("checkout")
    })
  })

  describe("createCommandSource", () => {
    it("uses the application's command registry when given none", () => {
      const source = createCommandSource()

      expect(source.prefix).toBe(">")
      expect(source.search("", makeContext())).toEqual([])
    })
  })
})
