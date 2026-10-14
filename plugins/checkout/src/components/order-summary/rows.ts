import type { Quote } from "../../checkout/source"

/**
 * The lines a summary shows, in the order it shows them.
 *
 * ## Fixed order, not the quote's
 *
 * Subtotal, discount, shipping, tax, total. A customer reads a receipt the
 * same way every time, and a server that returned its lines in a different
 * order one day would rearrange somebody's checkout for no reason they could
 * see. Phase 11 asks for "line ordering is stable" and this is where it is.
 *
 * ## Nothing here adds anything
 *
 * Each row names a field of the quote. The total is the server's total, not
 * the sum of the rows above it — if those two ever disagree, the honest thing
 * is to show the number the customer will be charged.
 */

export interface SummaryRow {
  key: "subtotal" | "discount" | "shipping" | "tax" | "total"
  label: string
  /**
   * What to show, in minor units.
   *
   * The server's own figure, except that a discount is shown negative. That is
   * a sign for display rather than arithmetic: the quote carries a discount as
   * a positive magnitude and has already taken it off the total, so a summary
   * that printed "£5.00" between a subtotal and a tax would be the only line
   * on a receipt that reduces the bill while reading as though it adds to it.
   *
   * The magnitude is still the server's. Nothing here decides how much a
   * discount is worth.
   */
  amount: number
}

const ORDER: readonly SummaryRow["key"][] = ["subtotal", "discount", "shipping", "tax", "total"]

const LABELS: Readonly<Record<SummaryRow["key"], string>> = {
  subtotal: "Subtotal",
  discount: "Discount",
  shipping: "Shipping",
  tax: "Tax",
  total: "Total",
}

function label(props: Readonly<Record<string, unknown>>, key: SummaryRow["key"]): string {
  const custom = props[`label${key}`]

  return typeof custom === "string" && custom.trim() !== "" ? custom : LABELS[key]
}

export function summaryRows(
  quote: Quote,
  props: Readonly<Record<string, unknown>>,
): readonly SummaryRow[] {
  /*
   * A zero line is hidden when the merchant says so, and the total never is.
   * "Tax £0.00" on an order with no tax is noise; a missing total is a
   * checkout that does not say what it costs.
   */
  const hideZero = props["hideZeroLines"] !== false

  return ORDER.filter((key) => key === "total" || !hideZero || quote[key] !== 0).map((key) => ({
    key,
    label: label(props, key),
    amount: key === "discount" ? -Math.abs(quote.discount) : quote[key],
  }))
}
