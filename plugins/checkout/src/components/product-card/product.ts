import type { Quote } from "../../checkout/source"

/**
 * What a Product Card shows, worked out from what the merchant wrote and what
 * the server said.
 *
 * ## Two sources, and only one of them can be charged
 *
 * A merchant authors a product in the editor: a title, a picture, a price. The
 * server prices the cart from the published schema and returns a line item per
 * node. Both describe the same product, and when both exist the server's is
 * the one on screen — it is the number the customer will actually be charged,
 * and a card showing the other would be a card that disagrees with the bill.
 *
 * The authored price is what a card falls back to when there is no quote,
 * which is the editor's canvas and the moment before the first quote arrives.
 * It is a preview of a price rather than a promise of one.
 *
 * ## The struck-through price is not arithmetic
 *
 * `wasPrice` is the authored list price, shown only when it is higher than
 * what is being charged. Nothing subtracts the two, and no total includes it:
 * it is a claim about the past, which is all a compare-at price has ever been.
 *
 * ## Nothing here multiplies
 *
 * `amount` is the line item's own `amount` — the server's figure for this line
 * at this quantity. When there is no line item there is no amount, because the
 * honest alternative would be `price * quantity`, and Phase 11's rule is that
 * no component computes a monetary amount.
 */

export interface ProductView {
  title: string
  description: string
  image: string
  imageAlt: string
  sku: string
  quantity: number
  currency: string
  /** What it costs now, in minor units. */
  price: number
  /** What it cost before, when that is more than it costs now. */
  wasPrice: number | null
  /** The server's figure for this line, or null when there is no quote. */
  amount: number | null
  /** What to say about stock, or null when there is nothing worth saying. */
  stock: string | null
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

/**
 * What to say about how many are left.
 *
 * Silence above the threshold. "47 in stock" is not reassurance, it is noise,
 * and a card that says it about everything says nothing about the one product
 * that is nearly gone.
 */
function stockWords(inventory: number | null, lowAt: number): string | null {
  if (inventory === null) return null
  if (inventory <= 0) return "Out of stock"
  if (inventory > lowAt) return null

  return inventory === 1 ? "Only 1 left" : `Only ${String(inventory)} left`
}

/**
 * How many of this to put in the cart.
 *
 * The merchant's number, never the quote's. A quote echoes the quantity it
 * priced, so a card that fed that back in would be taking its input from its
 * own output: the first quote would pin the quantity, and a server that
 * normalised one — capping it at what is in stock, say — would overwrite what
 * the merchant asked for and have no way of being told otherwise.
 *
 * What the card *shows* can be the quote's, because that is the quantity being
 * charged for. What it asks for is its own.
 */
export function cartQuantity(props: Readonly<Record<string, unknown>>): number {
  return count(props["quantity"]) ?? 1
}

export function productView(
  props: Readonly<Record<string, unknown>>,
  quote: Quote | null,
  nodeId: string,
): ProductView {
  const line = quote?.lineItems.find((item) => item.nodeId === nodeId && item.kind === "product")

  const listPrice = count(props["price"]) ?? 0
  const salePrice = count(props["salePrice"])
  const authored = salePrice !== null && salePrice > 0 ? salePrice : listPrice
  const price = line?.unitAmount ?? authored

  const title = text(props["title"])

  return {
    title,
    description: text(props["description"]),
    image: text(props["image"]),
    /*
     * An empty alt when the merchant wrote none, rather than the title.
     * The title is the next thing in the card, so a screen reader that read
     * the picture as well would hear the product named twice — and a decorative
     * image is exactly what a picture beside its own name is.
     */
    imageAlt: text(props["imageAlt"]),
    sku: text(props["sku"]),
    quantity: line?.quantity ?? count(props["quantity"]) ?? 1,
    currency: quote?.currency ?? (text(props["currency"]) || "GBP"),
    price,
    wasPrice: listPrice > price ? listPrice : null,
    amount: line?.amount ?? null,
    stock: stockWords(count(props["inventory"]), count(props["lowStockAt"]) ?? 5),
  }
}
