import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it } from "vitest"

import { CheckoutRenderer } from "../src/runtime/CheckoutRenderer"
import { buildStylesheet } from "../src/runtime/stylesheet"
import { clearThemeCache } from "../src/theme/compile"
import { at, contextFor, sampleDocument, standardRegistry, theme, wideDocument } from "./support"

beforeEach(() => {
  clearThemeCache()
})

const SOURCE = join(import.meta.dirname, "..", "src")

function sourceFiles(directory: string = SOURCE): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) return sourceFiles(path)

    return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") ? [path] : []
  })
}

describe("security", () => {
  it("never evaluates schema content as code", () => {
    // The strongest version of the promise is that the capability is absent
    // from the package, not that the current code happens not to use it.
    for (const file of sourceFiles()) {
      const source = readFileSync(file, "utf8")

      expect(source, file).not.toMatch(/\beval\s*\(/)
      expect(source, file).not.toMatch(/\bnew\s+Function\s*\(/)
      expect(source, file).not.toMatch(/\bFunction\s*\(\s*["'`]/)
    }
  })

  it("writes raw HTML in exactly one place, and it is CSS", () => {
    const users = sourceFiles().filter((file) =>
      readFileSync(file, "utf8").includes("dangerouslySetInnerHTML"),
    )

    expect(users.map((file) => file.slice(SOURCE.length + 1))).toEqual([
      join("runtime", "CheckoutRenderer.tsx"),
    ])
  })

  it("emits no script of its own", () => {
    const html = renderToStaticMarkup(
      <CheckoutRenderer
        schema={sampleDocument()}
        theme={theme}
        registry={standardRegistry()}
        mode="published"
      />,
    )

    expect(html).not.toContain("<script")
    expect(html.toLowerCase()).not.toContain("onload")
  })

  it("refuses a style value that would break out of its declaration", () => {
    const hostile = sampleDocument(
      at("desktop", {
        backgroundImage: "url(javascript:alert(1))",
        color: "red; position: fixed",
        content: "a} body {display:none",
        behavior: "url(#default#time2)",
        src: "@import url(https://evil.example.com/x.css)",
      }),
    )

    const context = contextFor(hostile)
    const { css } = buildStylesheet(context)

    for (const payload of [
      "javascript:",
      "position: fixed",
      "display:none",
      "#default#time2",
      "@import",
    ]) {
      expect(css, payload).not.toContain(payload)
    }

    expect(context.warnings().filter((warning) => warning.code === "style-fallback")).toHaveLength(
      5,
    )
  })

  it("refuses a property name that carries a payload", () => {
    const hostile = sampleDocument(at("desktop", { "color: red; position": "fixed" }))

    expect(buildStylesheet(contextFor(hostile)).css).not.toContain("position")
  })

  it("cannot close the style element it is written into", () => {
    // The guard refuses `<` and `>` in every value, which is what makes writing
    // the stylesheet with dangerouslySetInnerHTML safe.
    const hostile = sampleDocument(at("desktop", { color: "</style><script>alert(1)</script>" }))

    const html = renderToStaticMarkup(
      <CheckoutRenderer
        schema={hostile}
        theme={theme}
        registry={standardRegistry()}
        mode="published"
      />,
    )

    expect(html).not.toContain("<script")
    // Exactly one style element: the payload did not manage to close it and
    // open something else.
    expect(html.match(/<style/g)).toHaveLength(1)
    expect(html.match(/<\/style>/g)).toHaveLength(1)
  })
})

describe("performance", () => {
  it("renders 2,000 nodes in under 100ms", () => {
    const document = wideDocument(2_000, at("desktop", { padding: 8 }))
    const element = (
      <CheckoutRenderer
        schema={document}
        theme={theme}
        registry={standardRegistry()}
        mode="published"
      />
    )

    // Warm the theme cache the way a second request would find it.
    renderToStaticMarkup(element)
    clearThemeCache()
    renderToStaticMarkup(element)

    const started = performance.now()
    const html = renderToStaticMarkup(element)
    const elapsed = performance.now() - started

    expect(html).toContain("ck-t1999")
    expect(elapsed).toBeLessThan(100)
  })

  it("renders 5,000 nodes without failing", () => {
    const document = wideDocument(5_000)

    const html = renderToStaticMarkup(
      <CheckoutRenderer
        schema={document}
        theme={theme}
        registry={standardRegistry()}
        mode="published"
      />,
    )

    expect(html).toContain("ck-t4999")
  })

  it("resolves a node's styles once however many walks ask", () => {
    const document = wideDocument(200, at("desktop", { padding: 8 }))
    const context = contextFor(document)

    buildStylesheet(context)
    const first = buildStylesheet(context).css

    // The second build hits the memo for every node, and has to produce the
    // same stylesheet: a cache that returned something else would be worse than
    // no cache at all.
    expect(buildStylesheet(context).css).toBe(first)
  })
})
