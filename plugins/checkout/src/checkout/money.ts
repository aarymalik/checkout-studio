/**
 * Amounts, as they are carried and as they are shown.
 *
 * ## Minor units, always integers
 *
 * A quote's `total` is 1999, not 19.99. Floating point cannot hold a price:
 * `0.1 + 0.2` is not `0.3`, and a checkout that adds a penny to one order in a
 * thousand is a checkout nobody can reconcile. Stripe carries integers for the
 * same reason, and docs/stripe-integration.md says every amount is computed on
 * the server, so the only arithmetic here is the division that makes 1999 into
 * "£19.99".
 *
 * ## The exponent comes from the platform
 *
 * Most currencies have two decimal places. The yen has none — ¥1999 is one
 * thousand nine hundred and ninety-nine yen, not ¥19.99 — and the Bahraini
 * dinar has three. A table of exceptions is a table that is wrong about a
 * currency nobody tested.
 *
 * `Intl.NumberFormat` already knows, because it ships with the data every
 * browser and runtime has. Asking it is both smaller than a table and right
 * about currencies this product has never seen.
 */

/** How many minor units make one major unit of this currency. */
function minorUnitsPerMajor(currency: string): number {
  /*
   * `maximumFractionDigits` is optional in the type, because the resolved
   * options of a plain number format need not carry one. A currency format
   * always does — but "always" from a type's point of view is two, which is
   * the right answer for every currency this falls back for.
   */
  const { maximumFractionDigits } = new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).resolvedOptions()

  return 10 ** (maximumFractionDigits ?? 2)
}

export interface MoneyOptions {
  /** The reader's locale. The server decides the amount; this decides the words. */
  locale?: string
}

/**
 * An amount in minor units, as text.
 *
 * A code `Intl` cannot parse at all — not three letters — throws a
 * `RangeError`, which would take a checkout down over a typo. It falls back to
 * the code and the raw amount: visibly wrong, and legible enough that somebody
 * can see what happened.
 *
 * A code that is well formed but unknown does **not** throw. `ZZZ` formats
 * with two decimal places, which is ISO 4217's own default and the right
 * answer for a currency nobody here has heard of. I wrote the opposite in this
 * comment first, and a test found it.
 */
export function formatMoney(amount: number, currency: string, options: MoneyOptions = {}): string {
  const locale = options.locale ?? "en-GB"

  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
      amount / minorUnitsPerMajor(currency),
    )
  } catch {
    return `${currency.toUpperCase()} ${String(amount)}`
  }
}
