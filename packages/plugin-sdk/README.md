# @checkout-studio/plugin-sdk

Plugin contracts and registries.

The engine knows nothing about checkout logic, forms, or any particular
component. This package is the whole of what it does know.

## What a plugin is

```ts
export const manifest = pluginManifest.parse({
  id: "checkout",
  name: "Checkout",
  version: "1.0.0",
  description: "Payment, order summary, coupons.",
  author: "Checkout Studio",
  category: "checkout",
  compatibility: { minEngineVersion: "1.0.0", schemaVersion: "1.0.0" },
  permissions: ["payments"],
})

export function activate(api: PluginApi): void {
  api.registerComponent({
    type: "checkout.order-summary",
    name: "Order Summary",
    interactive: true,
    container: false,
    defaultProps: {},
    defaultStyles: {},
    renderer: OrderSummary,
  })
}
```

A plugin's id is the namespace of every component it registers. The `checkout`
plugin owns `checkout.*` and nothing else, which is what stops one plugin
quietly replacing another's components.

## What the host guarantees

- A plugin built for a different engine or schema major version is **disabled**,
  not activated and left to fail somewhere unhelpful.
- A plugin whose restricted permissions were withheld is **disabled**. Half a
  plugin is harder to reason about than none.
- A plugin whose `activate` throws is **failed**, and every registration it made
  before throwing is discarded. Four components and a broken fifth is worse than
  none.
- A plugin that collides with another contributes **nothing**, not everything up
  to the collision.

None of these stop the other plugins.

## The registry

The renderer receives a populated, frozen `RendererRegistry` and only reads from
it. It never loads a plugin and has no way to add a component. Applications
build the registry in one module that both the server and the client module
graph import, so the two graphs cannot disagree about what `core.button` is.

See [docs/plugin-api.md](../../docs/plugin-api.md).
