# @checkout-studio/plugin-checkout

The cart, the quote, and the components that show them.

Order Summary today. Product Card, Product List, Coupon, Order Bump, Shipping
Selector, Tax Summary, Trust Badges and Guarantee Box follow.

Its own namespace rather than `core`: a landing-page product on the same engine
ships without this plugin and loses nothing it needs.

## What this one is about

**Nothing here computes a monetary amount.** Every number on screen is a field
of the quote the server returned — there is no `+` in Order Summary. A summary
that added up its own lines could disagree with the charge, and the customer
would read one number while Stripe took the other.

The one sign it chooses is the discount's: a quote carries a discount as a
positive magnitude and has already taken it off the total, so printing "£5.00"
between a subtotal and a tax would make the only line that reduces the bill read
as though it adds to it. The magnitude is still the server's.

**The seam is an interface, and the provider never sees past it.**
`CheckoutDataSource` is one method: selections go up, a quote comes down. Phase
13 supplies the one that talks to the pricing engine; the tests supply one that
answers from memory; the design gallery supplies a third. The provider cannot
tell them apart, which is what lets these components be finished and checked
before a single Stripe call exists.

**Amounts are integers in minor units**, because floating point cannot hold a
price. The number of minor units per major comes from `Intl`, which already has
the data: the yen has none and the Bahraini dinar has three, and a table of
exceptions is a table that is wrong about a currency nobody tested.

**A failure shows no total at all.** Keeping the last good one beside a cart it
no longer describes is the "wrong total" the rules are about — a customer would
read it as the price of what is on screen now.

## Not here

**The provider is not registered with the plugin host.** It needs a data source,
and a source is a property of the application doing the rendering. A checkout
with a made-up source would show made-up prices, and there is nothing sensible
to default to.
