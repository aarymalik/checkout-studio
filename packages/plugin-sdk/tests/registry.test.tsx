import { describe, expect, it } from "vitest"

import { namespaceOf } from "../src/component"
import { orderProviders } from "../src/providers"
import { RegistryBuilder, RegistryError, emptyRegistry } from "../src/registry"
import { blocksPublish } from "../src/validators"
import { Provider, definition, slot } from "./support"

describe("type namespaces", () => {
  it("reads the namespace from a type id", () => {
    expect(namespaceOf("core.button")).toBe("core")
    expect(namespaceOf("checkout.order-summary")).toBe("checkout")
  })

  it("refuses anything that is not <namespace>.<kebab-name>", () => {
    expect(namespaceOf("button")).toBeNull()
    expect(namespaceOf("core.Button")).toBeNull()
    expect(namespaceOf("core.")).toBeNull()
    expect(namespaceOf(".button")).toBeNull()
    expect(namespaceOf("core.button.primary")).toBeNull()
  })
})

describe("the registry", () => {
  it("resolves a registered component", () => {
    const registry = new RegistryBuilder().component(definition("core.button")).build()

    expect(registry.has("core.button")).toBe(true)
    expect(registry.get("core.button")?.name).toBe("core.button")
    expect(registry.types()).toEqual(["core.button"])
  })

  it("returns nothing for a type it does not know", () => {
    const registry = emptyRegistry()

    expect(registry.has("core.button")).toBe(false)
    expect(registry.get("core.button")).toBeUndefined()
    expect(registry.types()).toEqual([])
  })

  it("keeps registration order, so the markup is stable", () => {
    const registry = new RegistryBuilder()
      .component(definition("core.section"))
      .component(definition("core.button"))
      .build()

    expect(registry.types()).toEqual(["core.section", "core.button"])
  })

  it("refuses a malformed type id", () => {
    expect(() => new RegistryBuilder().component(definition("button"))).toThrow(RegistryError)
    expect(() => new RegistryBuilder().component(definition("button"))).toThrow(
      /Expected <namespace>\.<kebab-name>/,
    )
  })

  it("refuses two components claiming the same type", () => {
    const builder = new RegistryBuilder().component(definition("core.button"))

    expect(() => builder.component(definition("core.button"))).toThrow(/already registered/)
  })

  it("holds a plugin to its own namespace", () => {
    const scope = new RegistryBuilder("core")

    scope.component(definition("core.button"))

    expect(() => scope.component(definition("checkout.coupon"))).toThrow(
      /may not register "checkout.coupon"/,
    )
  })

  it("carries the error code, so a host can tell a conflict from a crash", () => {
    try {
      new RegistryBuilder().component(definition("nope"))
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(RegistryError)
      expect((error as RegistryError).code).toBe("malformed-type")
    }
  })

  it("collects per-node validators, keyed by type", () => {
    const registry = new RegistryBuilder()
      .component(definition("core.heading", { validate: () => "Add some text." }))
      .component(definition("core.section"))
      .build()

    const validators = registry.componentValidators()

    expect([...validators.keys()]).toEqual(["core.heading"])
    expect(validators.get("core.heading")?.({} as never, {} as never)).toBe("Add some text.")
  })

  it("collects whole-page validators", () => {
    const registry = new RegistryBuilder()
      .documentValidator({
        rule: "checkout.missing-payment-element",
        label: "Payment element present",
        validate: () => [],
      })
      .build()

    expect(registry.documentValidators().map((entry) => entry.rule)).toEqual([
      "checkout.missing-payment-element",
    ])
  })

  it("refuses two validators claiming the same rule", () => {
    const builder = new RegistryBuilder().documentValidator({
      rule: "checkout.one",
      label: "One",
      validate: () => [],
    })

    expect(() =>
      builder.documentValidator({ rule: "checkout.one", label: "Again", validate: () => [] }),
    ).toThrow(/already registered/)
  })

  it("exposes a component's theme slot", () => {
    const registry = new RegistryBuilder()
      .component(definition("core.button", { themeSlot: slot }))
      .component(definition("core.section"))
      .build()

    expect(registry.themeSlot("core.button")?.label).toBe("Box")
    expect(registry.themeSlot("core.section")).toBeUndefined()
    expect(registry.themeSlot("core.nothing")).toBeUndefined()
  })

  it("is frozen once built", () => {
    // The renderer memoises component resolution. A registry that could gain a
    // component mid-render would make that cache wrong rather than stale.
    expect(Object.isFrozen(emptyRegistry())).toBe(true)
  })

  it("refuses two providers claiming the same id", () => {
    const builder = new RegistryBuilder().provider({ id: "forms", component: Provider })

    expect(() => builder.provider({ id: "forms", component: Provider })).toThrow(
      /provider is already registered/,
    )
  })
})

describe("merging one plugin's scope into another's", () => {
  it("reports nothing when the scopes are disjoint", () => {
    const builder = new RegistryBuilder()
      .component(definition("core.button"))
      .documentValidator({ rule: "core.one", label: "One", validate: () => [] })
      .provider({ id: "core", component: Provider })
    const scope = new RegistryBuilder("checkout")
      .component(definition("checkout.coupon"))
      .documentValidator({ rule: "checkout.one", label: "One", validate: () => [] })
      .provider({ id: "checkout", component: Provider })

    expect(builder.conflict(scope)).toBeNull()
  })

  it("reports a component another plugin already owns", () => {
    const builder = new RegistryBuilder().component(definition("core.button"))
    const scope = new RegistryBuilder()
    scope.component(definition("core.button"))

    expect(builder.conflict(scope)?.code).toBe("duplicate-component")
  })

  it("reports a rule another plugin already owns", () => {
    const rule = { rule: "core.one", label: "One", validate: () => [] }
    const builder = new RegistryBuilder().documentValidator(rule)
    const scope = new RegistryBuilder().documentValidator(rule)

    expect(builder.conflict(scope)?.code).toBe("duplicate-rule")
  })

  it("reports a provider another plugin already owns", () => {
    const builder = new RegistryBuilder().provider({ id: "forms", component: Provider })
    const scope = new RegistryBuilder().provider({ id: "forms", component: Provider })

    expect(builder.conflict(scope)?.code).toBe("duplicate-provider")
  })

  it("hands over everything it holds", () => {
    const scope = new RegistryBuilder()
      .component(definition("core.button"))
      .documentValidator({ rule: "core.one", label: "One", validate: () => [] })
      .provider({ id: "core", component: Provider })

    const drained = scope.drain()

    expect(drained.components).toHaveLength(1)
    expect(drained.rules).toHaveLength(1)
    expect(drained.providers).toHaveLength(1)
  })
})

describe("provider ordering", () => {
  it("puts a dependency outside the provider that named it", () => {
    const result = orderProviders([
      { id: "checkout", component: Provider, dependsOn: ["forms"] },
      { id: "forms", component: Provider },
    ])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // The forms provider wraps the checkout provider, because checkout fields
    // are form fields.
    expect(result.order.map((entry) => entry.id)).toEqual(["forms", "checkout"])
  })

  it("keeps registration order among providers that do not constrain each other", () => {
    const result = orderProviders([
      { id: "analytics", component: Provider },
      { id: "forms", component: Provider },
      { id: "cms", component: Provider },
    ])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.order.map((entry) => entry.id)).toEqual(["analytics", "forms", "cms"])
  })

  it("orders a chain of three", () => {
    const result = orderProviders([
      { id: "checkout", component: Provider, dependsOn: ["forms"] },
      { id: "forms", component: Provider, dependsOn: ["variables"] },
      { id: "variables", component: Provider },
    ])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.order.map((entry) => entry.id)).toEqual(["variables", "forms", "checkout"])
  })

  it("visits a shared dependency once", () => {
    const result = orderProviders([
      { id: "checkout", component: Provider, dependsOn: ["forms"] },
      { id: "quiz", component: Provider, dependsOn: ["forms"] },
      { id: "forms", component: Provider },
    ])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.order.map((entry) => entry.id)).toEqual(["forms", "checkout", "quiz"])
  })

  it("refuses a dependency that was never registered", () => {
    const result = orderProviders([{ id: "checkout", component: Provider, dependsOn: ["forms"] }])

    expect(result).toEqual({
      ok: false,
      error: { code: "missing", id: "checkout", dependency: "forms" },
    })
  })

  it("refuses a loop, naming everyone in it", () => {
    const result = orderProviders([
      { id: "a", component: Provider, dependsOn: ["b"] },
      { id: "b", component: Provider, dependsOn: ["a"] },
    ])

    expect(result).toEqual({ ok: false, error: { code: "cycle", ids: ["a", "b", "a"] } })
  })

  it("is refused by the registry too, with the reason spelled out", () => {
    const loop = new RegistryBuilder()
      .provider({ id: "a", component: Provider, dependsOn: ["b"] })
      .provider({ id: "b", component: Provider, dependsOn: ["a"] })

    expect(() => loop.build()).toThrow(/depend on each other in a loop: a → b → a/)

    const orphan = new RegistryBuilder().provider({
      id: "checkout",
      component: Provider,
      dependsOn: ["forms"],
    })

    expect(() => orphan.build()).toThrow(/depends on "forms", which is not registered/)
  })

  it("exposes the ordered providers through the registry", () => {
    const registry = new RegistryBuilder()
      .provider({ id: "checkout", component: Provider, dependsOn: ["forms"] })
      .provider({ id: "forms", component: Provider })
      .build()

    expect(registry.providers().map((entry) => entry.id)).toEqual(["forms", "checkout"])
  })
})

describe("issue severity", () => {
  it("blocks a publish on an error or worse", () => {
    expect(blocksPublish([{ rule: "a.b", severity: "error", message: "", nodeIds: [] }])).toBe(true)
    expect(blocksPublish([{ rule: "a.b", severity: "critical", message: "", nodeIds: [] }])).toBe(
      true,
    )
  })

  it("does not block on information or a warning", () => {
    expect(
      blocksPublish([
        { rule: "a.b", severity: "info", message: "", nodeIds: [] },
        { rule: "a.c", severity: "warning", message: "", nodeIds: [] },
      ]),
    ).toBe(false)
    expect(blocksPublish([])).toBe(false)
  })
})
