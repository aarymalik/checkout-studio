import { describe, expect, it, vi } from "vitest"

import { createPluginApi } from "../src/api"
import { PluginHost } from "../src/lifecycle"
import { createGrant } from "../src/permissions"
import { RegistryBuilder } from "../src/registry"
import { ENGINE, Provider, definition, manifest, plugin } from "./support"

describe("the plugin api", () => {
  it("registers into the scope it was given, and nothing else", () => {
    const scope = new RegistryBuilder("core")
    const api = createPluginApi(manifest(), createGrant(["schema:read"]), scope)

    api.registerComponent(definition("core.button"))
    api.registerDocumentValidator({ rule: "core.one", label: "One", validate: () => [] })
    api.registerProvider({ id: "core", component: Provider })

    const drained = scope.drain()

    expect(drained.components.map((entry) => entry.type)).toEqual(["core.button"])
    expect(drained.rules.map((entry) => entry.rule)).toEqual(["core.one"])
    expect(drained.providers.map((entry) => entry.id)).toEqual(["core"])
  })

  it("hands the plugin its manifest and its permissions, and nothing to write to", () => {
    const api = createPluginApi(manifest(), createGrant(["schema:read"]), new RegistryBuilder())

    expect(api.manifest.id).toBe("core")
    expect(api.permissions.has("schema:read")).toBe(true)
    expect(Object.isFrozen(api)).toBe(true)
  })
})

describe("the plugin host", () => {
  it("activates a plugin and returns its registrations", async () => {
    const host = new PluginHost({ versions: ENGINE })

    host.register(
      plugin({}, (api) => {
        api.registerComponent(definition("core.button"))
      }),
    )

    const registry = await host.start()

    expect(registry.types()).toEqual(["core.button"])
    expect(host.records()).toEqual([{ manifest: manifest(), state: "active" }])
  })

  it("carries a plugin's validators and providers into the registry", async () => {
    const host = new PluginHost({ versions: ENGINE })

    host.register(
      plugin({}, (api) => {
        api.registerDocumentValidator({
          rule: "core.has-content",
          label: "Page has content",
          validate: () => [],
        })
        api.registerProvider({ id: "core", component: Provider })
      }),
    )

    const registry = await host.start()

    expect(registry.documentValidators().map((entry) => entry.rule)).toEqual(["core.has-content"])
    expect(registry.providers().map((entry) => entry.id)).toEqual(["core"])
  })

  it("holds nothing until it is started", () => {
    const host = new PluginHost({ versions: ENGINE })

    host.register(plugin({}, () => {}))

    expect(host.current()).toBeNull()
    expect(host.records().map((record) => record.state)).toEqual(["registered"])
  })

  it("awaits an asynchronous activate", async () => {
    const host = new PluginHost({ versions: ENGINE })

    host.register(
      plugin({}, async (api) => {
        await Promise.resolve()
        api.registerComponent(definition("core.button"))
      }),
    )

    const registry = await host.start()

    expect(registry.has("core.button")).toBe(true)
  })

  it("ignores a second plugin with an id already taken", async () => {
    const host = new PluginHost({ versions: ENGINE })

    host
      .register(
        plugin({}, (api) => {
          api.registerComponent(definition("core.button"))
        }),
      )
      .register(
        plugin({}, (api) => {
          api.registerComponent(definition("core.heading"))
        }),
      )

    const registry = await host.start()

    // Ids are namespaces. Allowing both would let the second silently shadow
    // the first's components.
    expect(registry.types()).toEqual(["core.button"])
    expect(host.records()).toHaveLength(1)
  })

  it("returns itself from register, so registration reads as a list", () => {
    const host = new PluginHost({ versions: ENGINE })

    expect(host.register(plugin({}, () => {}))).toBe(host)
  })

  it("disables an incompatible plugin instead of activating it", async () => {
    const host = new PluginHost({ versions: ENGINE })

    host.register(
      plugin({ compatibility: { minEngineVersion: "9.0.0", schemaVersion: "1.0.0" } }, (api) => {
        api.registerComponent(definition("core.button"))
      }),
    )

    const registry = await host.start()
    const [record] = host.records()

    expect(registry.types()).toEqual([])
    expect(record?.state).toBe("disabled")
    expect(record?.problem?.code).toBe("incompatible")
  })

  it("disables a plugin whose restricted permissions were withheld", async () => {
    const activate = vi.fn()
    const host = new PluginHost({ versions: ENGINE })

    host.register(plugin({ permissions: ["schema:write", "publish"] }, activate))

    await host.start()
    const [record] = host.records()

    // Half a plugin is harder to reason about than none, so it never runs.
    expect(activate).not.toHaveBeenCalled()
    expect(record?.state).toBe("disabled")
    expect(record?.problem?.code).toBe("permission-withheld")
    expect(record?.problem?.message).toContain("schema:write, publish")
  })

  it("activates a plugin whose permissions were granted", async () => {
    const host = new PluginHost({
      versions: ENGINE,
      granted: { core: ["schema:write"] },
    })

    host.register(
      plugin({ permissions: ["schema:read", "schema:write"] }, (api) => {
        expect(api.permissions.has("schema:write")).toBe(true)
        api.registerComponent(definition("core.button"))
      }),
    )

    await host.start()

    expect(host.records()[0]?.state).toBe("active")
  })

  it("needs no approval for an unrestricted permission", async () => {
    const host = new PluginHost({ versions: ENGINE })

    host.register(plugin({ permissions: ["schema:read", "assets:read"] }, () => {}))

    await host.start()

    expect(host.records()[0]?.state).toBe("active")
  })

  it("records a plugin that throws, and keeps the others", async () => {
    const host = new PluginHost({ versions: ENGINE })

    host
      .register(
        plugin({ id: "broken", name: "Broken" }, () => {
          throw new Error("no idea what I am doing")
        }),
      )
      .register(
        plugin({}, (api) => {
          api.registerComponent(definition("core.button"))
        }),
      )

    const registry = await host.start()

    expect(registry.types()).toEqual(["core.button"])
    expect(host.records().map((record) => [record.manifest.id, record.state])).toEqual([
      ["broken", "failed"],
      ["core", "active"],
    ])
    expect(host.records()[0]?.problem).toEqual({
      code: "activation-failed",
      message: "no idea what I am doing",
    })
  })

  it("reports a thrown non-error as best it can", async () => {
    const host = new PluginHost({ versions: ENGINE })

    host.register(
      plugin({}, () => {
        throw "just a string"
      }),
    )

    await host.start()

    expect(host.records()[0]?.problem?.message).toBe("just a string")
  })

  it("discards everything a failing plugin registered before it failed", async () => {
    const host = new PluginHost({ versions: ENGINE })

    host.register(
      plugin({}, (api) => {
        api.registerComponent(definition("core.button"))
        api.registerComponent(definition("core.heading"))
        throw new Error("fell over on the third")
      }),
    )

    const registry = await host.start()

    // Four components and a broken fifth is worse than none: the page would
    // render half a plugin's worth of features with no sign anything was wrong.
    expect(registry.types()).toEqual([])
  })

  it("discards a whole plugin when anything it registered collides", async () => {
    const host = new PluginHost({ versions: ENGINE })

    host
      .register(
        plugin({}, (api) => {
          api.registerComponent(definition("core.button"))
          api.registerProvider({ id: "shared", component: Provider })
        }),
      )
      .register(
        plugin({ id: "rival", name: "Rival" }, (api) => {
          api.registerComponent(definition("rival.badge"))
          // Component types are namespaced, so two plugins cannot collide
          // there. Provider ids are not, which is the collision that reaches
          // the merge — and it costs the rival its badge as well.
          api.registerProvider({ id: "shared", component: Provider })
        }),
      )

    const registry = await host.start()

    expect(registry.types()).toEqual(["core.button"])
    expect(host.records()[1]?.problem?.code).toBe("registration-conflict")
    expect(host.records()[1]?.problem?.message).toContain('"shared" provider')
  })

  it("stops a plugin that registers outside its own namespace", async () => {
    const host = new PluginHost({ versions: ENGINE })

    host.register(
      plugin({}, (api) => {
        api.registerComponent(definition("checkout.coupon"))
      }),
    )

    await host.start()

    expect(host.records()[0]?.problem?.code).toBe("registration-conflict")
    expect(host.records()[0]?.problem?.message).toContain("may not register")
  })

  it("deactivates every active plugin and drops the registry", async () => {
    const deactivate = vi.fn()
    const host = new PluginHost({ versions: ENGINE })

    host.register(plugin({}, () => {}, deactivate))

    await host.start()
    await host.stop()

    expect(deactivate).toHaveBeenCalledTimes(1)
    expect(host.current()).toBeNull()
    expect(host.records()[0]?.state).toBe("registered")
  })

  it("does not deactivate a plugin that never activated", async () => {
    const deactivate = vi.fn()
    const host = new PluginHost({ versions: ENGINE })

    host.register(
      plugin(
        { compatibility: { minEngineVersion: "9.0.0", schemaVersion: "1.0.0" } },
        () => {},
        deactivate,
      ),
    )

    await host.start()
    await host.stop()

    expect(deactivate).not.toHaveBeenCalled()
  })

  it("tolerates a plugin with no deactivate", async () => {
    const host = new PluginHost({ versions: ENGINE })

    host.register(plugin({}, () => {}))

    await host.start()

    await expect(host.stop()).resolves.toBeUndefined()
  })

  it("records a deactivate that throws and still stops the rest", async () => {
    const deactivate = vi.fn()
    const host = new PluginHost({ versions: ENGINE })

    host
      .register(
        plugin(
          { id: "messy", name: "Messy" },
          () => {},
          () => {
            throw new Error("left the tap running")
          },
        ),
      )
      .register(plugin({}, () => {}, deactivate))

    await host.start()
    await host.stop()

    expect(deactivate).toHaveBeenCalledTimes(1)
    expect(host.records()[0]?.state).toBe("failed")
    expect(host.records()[0]?.problem?.message).toBe("left the tap running")
  })

  it("can be started again after stopping", async () => {
    const host = new PluginHost({ versions: ENGINE })

    host.register(
      plugin({}, (api) => {
        api.registerComponent(definition("core.button"))
      }),
    )

    await host.start()
    await host.stop()
    const registry = await host.start()

    expect(registry.types()).toEqual(["core.button"])
    expect(host.current()).toBe(registry)
  })
})
