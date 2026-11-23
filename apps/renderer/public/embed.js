/**
 * The embed loader.
 *
 * docs/renderer.md § Embed Mode. One job: put an iframe on the merchant's
 * page pointing at the checkout, and keep it the height of its contents.
 *
 *   <script src="https://checkout.example.com/embed.js"
 *           data-checkout-id="pag_123"></script>
 *
 * Plain JavaScript in `public/`, with no build step and no dependencies,
 * because this is the one file of ours that runs on somebody else's page.
 * Every byte of it is on a payment page's critical path, it is read by
 * merchants deciding whether to trust us, and a bundle would make both of
 * those worse.
 *
 * It is deliberately the whole of our presence there. The checkout renders
 * inside the frame, on a page we serve, so the merchant's scripts and
 * styles cannot read or alter the payment form — see docs/security.md.
 */
;(function () {
  "use strict"

  const script = document.currentScript

  if (!script) return

  const checkoutId = script.getAttribute("data-checkout-id")

  if (!checkoutId) {
    console.error("[checkout] the embed script needs a data-checkout-id attribute")

    return
  }

  /*
   * Our origin, taken from where this file was served rather than written
   * into it. One file works for every environment, and a merchant who
   * copied the snippet from the wrong place gets a frame that fails
   * visibly rather than one that silently points at production.
   */
  const origin = new URL(script.src).origin

  const frame = document.createElement("iframe")

  frame.src = origin + "/embed/" + encodeURIComponent(checkoutId)
  frame.style.width = "100%"
  frame.style.border = "0"
  frame.style.display = "block"
  // Until it says otherwise. Tall enough not to clip a short checkout on
  // first paint, which would otherwise show a scrollbar for a moment.
  frame.style.height = "550px"
  frame.setAttribute("title", "Checkout")
  // Wallets. Apple Pay additionally needs the host domain registered as a
  // payment method domain; embed setup does that.
  frame.setAttribute("allow", "payment")
  frame.setAttribute("loading", "eager")

  let ready = false
  let timer = 0

  /**
   * Puts the frame where it will actually be seen.
   *
   * Beside the script, which is where a merchant put it and therefore where
   * they expect the checkout. Except in `<head>`, where nothing renders: a
   * snippet pasted into a template's head would otherwise load the checkout
   * and show nothing, which is the least diagnosable failure available.
   */
  function mount() {
    const parent = script.parentNode

    if (parent && parent !== document.head) parent.insertBefore(frame, script.nextSibling)
    else document.body.appendChild(frame)

    timer = window.setTimeout(explain, 8000)
  }

  /**
   * Says, in the space the checkout would have taken, that it did not load.
   *
   * A frame refused by `frame-ancestors` renders nothing and reports it to
   * a console the merchant does not have open. Without this, the symptom is
   * a blank rectangle and the cause is three layers away.
   *
   * It names the origin it was loaded from, because that is the exact
   * string that has to be registered and the one a merchant would otherwise
   * have to guess.
   */
  function explain() {
    if (ready) return

    frame.style.display = "none"

    const notice = document.createElement("div")

    notice.setAttribute("role", "alert")
    notice.style.cssText =
      "border:1px solid #d4d4d8;border-radius:8px;padding:16px;" +
      "font:14px/1.5 system-ui,sans-serif;color:#3f3f46"
    notice.textContent =
      "This checkout did not load. " +
      window.location.origin +
      " is not registered as a domain for it."

    frame.parentNode.insertBefore(notice, frame)
  }

  if (script.parentNode === document.head && !document.body) {
    document.addEventListener("DOMContentLoaded", mount)
  } else {
    mount()
  }

  window.addEventListener("message", function (event) {
    /*
     * Both checks matter. The origin proves the message came from us, and
     * the source proves it came from *this* frame rather than another one
     * on the page that happens to share our origin.
     */
    if (event.origin !== origin || event.source !== frame.contentWindow) return

    const message = event.data

    if (!message || typeof message !== "object") return

    if (message.type === "embed:ready") {
      ready = true
      window.clearTimeout(timer)

      return
    }

    if (message.type === "embed:resize" && typeof message.height === "number") {
      // Guarded rather than trusted: a height of zero collapses the
      // checkout, and an enormous one scrolls the merchant's page to
      // nowhere. Neither is a thing the frame should be able to do.
      const height = Math.min(Math.max(message.height, 120), 20000)

      frame.style.height = height + "px"
    }
  })
})()
