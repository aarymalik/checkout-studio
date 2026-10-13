import type { FieldOption } from "../../form/fields"

/**
 * Every country, for the inspector to offer.
 *
 * ## This never reaches a published checkout
 *
 * It is imported by the property definitions, which live in the plugin's
 * `./editor` entry — and nothing in the renderer's module graph imports that.
 * A merchant picks the countries they ship to, those are stored in the
 * document, and the published page carries exactly that list and no more.
 *
 * Which is the point. A checkout that ships to three countries should not make
 * a customer download two hundred and fifty, and the list is the first thing
 * in this product where the *data* would have been the bundle cost rather than
 * the code. Storing the choice in the document costs the published page
 * nothing and gives the shopper a shorter list to read.
 *
 * ## Names, not a localisation
 *
 * English names, as a starting point a merchant edits. Translating them is the
 * same problem as translating everything else on the page, which Phase 17
 * takes on; a half-localised list would be worse than one that is plainly in
 * one language.
 */
export const COUNTRIES: readonly FieldOption[] = [
  { value: "AU", label: "Australia" },
  { value: "AT", label: "Austria" },
  { value: "BE", label: "Belgium" },
  { value: "BR", label: "Brazil" },
  { value: "CA", label: "Canada" },
  { value: "CN", label: "China" },
  { value: "CZ", label: "Czechia" },
  { value: "DK", label: "Denmark" },
  { value: "FI", label: "Finland" },
  { value: "FR", label: "France" },
  { value: "DE", label: "Germany" },
  { value: "GR", label: "Greece" },
  { value: "HK", label: "Hong Kong" },
  { value: "HU", label: "Hungary" },
  { value: "IN", label: "India" },
  { value: "IE", label: "Ireland" },
  { value: "IL", label: "Israel" },
  { value: "IT", label: "Italy" },
  { value: "JP", label: "Japan" },
  { value: "MY", label: "Malaysia" },
  { value: "MX", label: "Mexico" },
  { value: "NL", label: "Netherlands" },
  { value: "NZ", label: "New Zealand" },
  { value: "NO", label: "Norway" },
  { value: "PL", label: "Poland" },
  { value: "PT", label: "Portugal" },
  { value: "SG", label: "Singapore" },
  { value: "ZA", label: "South Africa" },
  { value: "KR", label: "South Korea" },
  { value: "ES", label: "Spain" },
  { value: "SE", label: "Sweden" },
  { value: "CH", label: "Switzerland" },
  { value: "AE", label: "United Arab Emirates" },
  { value: "GB", label: "United Kingdom" },
  { value: "US", label: "United States" },
]

/** The two-letter codes, for checking a stored option against the list. */
export const COUNTRY_CODES: ReadonlySet<string> = new Set(COUNTRIES.map((country) => country.value))
