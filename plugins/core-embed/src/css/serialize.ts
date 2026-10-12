import type { CssRule } from "./parse"

/**
 * Stored rules, back as CSS, for the editor to put in a textarea.
 *
 * The same trade `html/serialize.ts` makes: one stored value rather than two,
 * at the cost of a reopened block showing the CSS that survived rather than
 * the CSS that was pasted — which is the more honest of the two, because it is
 * what the page will actually use.
 *
 * Properties are written back in CSS's spelling. A document stores `fontSize`
 * because that is how it stores every style; nobody writes that in a
 * stylesheet.
 */
function kebabCase(property: string): string {
  return property.startsWith("--")
    ? property
    : property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

export function serializeCss(rules: readonly CssRule[]): string {
  return rules
    .map((rule) => {
      const body = Object.entries(rule.declarations)
        .map(([property, value]) => `  ${kebabCase(property)}: ${value};`)
        .join("\n")

      return `${rule.selector} {\n${body}\n}`
    })
    .join("\n\n")
}
