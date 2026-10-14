"use client"

import { useEffect } from "react"

import { useCheckout } from "../../checkout/CheckoutProvider"

/**
 * Puts this node's product in the cart, and takes it out again.
 *
 * ## The page is the cart
 *
 * `CartItem.nodeId` is "the node that put this in the cart, which is how the
 * server prices it" — so a Product Card on a checkout page *is* the statement
 * that this product is being bought. Nothing else assembles the cart: there is
 * no list of items somewhere that has to be kept in step with what the page
 * shows, because the page showing it is what puts it there.
 *
 * A card that goes takes its item with it, which is what makes a conditional
 * product work later without a second mechanism that has to agree with the
 * first.
 *
 * ## Why the dependencies are what they are
 *
 * `setQuantity` is a `useCallback` with no dependencies, so it is stable for
 * the life of the provider; `nodeId` and `quantity` are a string and a number.
 * Everything this effect depends on is a value that compares by identity, and
 * none of it is an object rebuilt each render.
 *
 * That is not a stylistic preference. The same hook written against a spec
 * object re-registered on every render and re-quoted forever — twice, in
 * core-forms, the second time through a prop that merely looked stable. An
 * effect that writes to the state that re-renders it has to be given nothing
 * it can disagree with.
 */
export function useCartItem(nodeId: string, quantity: number): void {
  const checkout = useCheckout()
  const setQuantity = checkout?.setQuantity

  /*
   * How many, kept up to date — and deliberately without a cleanup.
   *
   * One effect doing both jobs removes the item before re-adding it whenever
   * the quantity changes, because React runs an effect's cleanup before the
   * effect itself. For an instant the cart is empty, the provider sees nothing
   * to price, and the total a customer is looking at disappears and comes
   * back. The test that changes a quantity is what found it.
   */
  useEffect(() => {
    if (setQuantity === undefined) return

    setQuantity(nodeId, quantity)
  }, [setQuantity, nodeId, quantity])

  /*
   * Gone from the page, gone from the cart — and only then. This effect has
   * nothing in it that a quantity can change, so its cleanup runs when the
   * card unmounts and at no other time.
   */
  useEffect(() => {
    if (setQuantity === undefined) return

    return () => {
      setQuantity(nodeId, 0)
    }
  }, [setQuantity, nodeId])
}
