/**
 * Splitting a CSS value without splitting what is inside its brackets.
 *
 * `rgba(10, 10, 10, 0.08)` has spaces in it and is one value; so does
 * `calc(100% - 8px)`. Splitting on every space reads either as several values
 * and turns a working declaration into nonsense — which is how a padding of
 * `calc(100% - 8px)` once became three sides.
 *
 * Shared because both of the places that take a CSS value apart need it: the
 * four sides of a padding, and the parts of a shadow.
 */
export function splitTopLevel(value: string, separator = /\s/): readonly string[] {
  const found: string[] = []
  let depth = 0
  let current = ""

  for (const character of value.trim()) {
    if (character === "(") depth += 1
    if (character === ")") depth -= 1

    if (depth === 0 && separator.test(character)) {
      if (current !== "") found.push(current)
      current = ""
      continue
    }

    current += character
  }

  if (current !== "") found.push(current)

  return found
}
