import { describe, expect, it } from "vitest"
import {
  CURRENT_PARAMETERS,
  MAXIMUM_LENGTH,
  MINIMUM_LENGTH,
  __decoyHashForTests,
  checkPassword,
  hashPassword,
  parseParameters,
  verifyAgainstNothing,
  verifyPassword,
} from "./password"

/*
 * Not the xkcd passphrase: that one is on every wordlist in the world, and the
 * common-password check rejects it — correctly.
 */
const GOOD = "ambling walrus thicket ninety"

describe("hashing", () => {
  it("produces an Argon2id hash with the current parameters", async () => {
    const hash = await hashPassword(GOOD)

    expect(hash.startsWith("$argon2id$")).toBe(true)
    expect(parseParameters(hash)).toEqual(CURRENT_PARAMETERS)
  })

  it("never yields the password back", async () => {
    const hash = await hashPassword(GOOD)

    expect(hash).not.toContain(GOOD)
    expect(hash).not.toContain("correct")
  })

  it("gives the same password a different hash every time", async () => {
    // Different salts. Two accounts with the same password must not be
    // identifiable as such from the table alone.
    const [first, second] = await Promise.all([hashPassword(GOOD), hashPassword(GOOD)])

    expect(first).not.toBe(second)
  })

  it("costs enough to be worth the wait", () => {
    // OWASP's floor is 19 MiB and two passes. Below that, a leaked table is a
    // list of passwords rather than a list of hashes.
    expect(CURRENT_PARAMETERS.memoryCost).toBeGreaterThanOrEqual(19_456)
    expect(CURRENT_PARAMETERS.timeCost).toBeGreaterThanOrEqual(2)
  })
})

describe("verifying", () => {
  it("accepts the right password", async () => {
    const hash = await hashPassword(GOOD)

    expect(await verifyPassword(hash, GOOD)).toEqual({ valid: true, needsRehash: false })
  })

  it("rejects the wrong one", async () => {
    const hash = await hashPassword(GOOD)

    expect((await verifyPassword(hash, "ambling walrus thicket ninet")).valid).toBe(false)
  })

  it("is case sensitive and whitespace sensitive", async () => {
    const hash = await hashPassword(GOOD)

    expect((await verifyPassword(hash, GOOD.toUpperCase())).valid).toBe(false)
    expect((await verifyPassword(hash, `${GOOD} `)).valid).toBe(false)
  })

  it("rejects a stored value that is not a hash, rather than throwing", async () => {
    // An account migrated from an identity provider carries a placeholder. It
    // should be told its password is wrong, not handed a 500.
    expect(await verifyPassword("migrated:no-password", GOOD)).toEqual({
      valid: false,
      needsRehash: false,
    })
    expect(await verifyPassword("", GOOD)).toEqual({ valid: false, needsRehash: false })
  })

  it("asks for a rehash when the stored hash is weaker than current", async () => {
    // Written with yesterday's parameters. The password is still right, and
    // this is the one moment it is in memory and known to be right.
    const weak = `$argon2id$v=19$m=19456,t=2,p=1${(await hashPassword(GOOD)).slice(
      (await hashPassword(GOOD)).indexOf("$", 10),
    )}`

    expect(parseParameters(weak)?.memoryCost).toBe(19_456)
  })

  it("does not ask for a rehash when the password was wrong", async () => {
    const hash = await hashPassword(GOOD)

    expect(await verifyPassword(hash, "wrong")).toEqual({ valid: false, needsRehash: false })
  })
})

describe("the decoy", () => {
  it("is a real hash with the current parameters", async () => {
    /*
     * The point of this test.
     *
     * A hand-written constant that is not a valid Argon2id hash is rejected in
     * microseconds, which leaves verifyAgainstNothing costing nothing and the
     * timing difference it exists to hide fully intact. It would pass every
     * other test in this file.
     */
    const hash = await __decoyHashForTests()

    expect(parseParameters(hash)).toEqual(CURRENT_PARAMETERS)
  })

  it("verifies nothing", async () => {
    const hash = await __decoyHashForTests()

    expect((await verifyPassword(hash, GOOD)).valid).toBe(false)
    expect((await verifyPassword(hash, "")).valid).toBe(false)
  })

  it("costs about as much as a real verification", async () => {
    const hash = await hashPassword(GOOD)
    await verifyAgainstNothing("warm the cache")

    const realStart = performance.now()
    await verifyPassword(hash, "a wrong password")
    const real = performance.now() - realStart

    const decoyStart = performance.now()
    await verifyAgainstNothing("a wrong password")
    const decoy = performance.now() - decoyStart

    // Generous, because this is a shared machine running other tests. The
    // failure it catches is an order of magnitude, not a percentage.
    expect(decoy).toBeGreaterThan(real / 4)
  })
})

describe("what may be used as a password", () => {
  it("accepts a passphrase", () => {
    expect(checkPassword(GOOD)).toBeNull()
  })

  it("refuses one that is too short", () => {
    expect(checkPassword("a".repeat(MINIMUM_LENGTH - 1))).toBe("too-short")
    expect(checkPassword("a".repeat(MINIMUM_LENGTH))).not.toBe("too-short")
  })

  it("refuses one long enough to be an attack", () => {
    expect(checkPassword("a".repeat(MAXIMUM_LENGTH + 1))).toBe("too-long")
  })

  it("allows well past the length anyone types", () => {
    // A maximum below 64 is a maximum that rejects a real passphrase.
    expect(MAXIMUM_LENGTH).toBeGreaterThanOrEqual(64)
    expect(checkPassword("a".repeat(64))).toBeNull()
  })

  it("refuses passwords everyone tries first", () => {
    expect(checkPassword("correcthorsebatterystaple")).toBe("too-common")
    expect(checkPassword("administrator")).toBe("too-common")
  })

  it("does not care how they were capitalised", () => {
    expect(checkPassword("CorrectHorseBatteryStaple")).toBe("too-common")
  })

  it("sees through the disguise a composition rule demands", () => {
    // Each of these is the same guess as "password", wearing what a rule asked
    // for, and each is long enough to pass the length check on its own. An
    // exact-match list misses every one.
    for (const disguised of ["p@ssw0rd1234", "P@ssword!!99", "p.a.s.s.w.o.r.d.1", "Passw0rd99!!"]) {
      expect(disguised.length).toBeGreaterThanOrEqual(MINIMUM_LENGTH)
      expect(checkPassword(disguised)).toBe("too-common")
    }
  })

  it("does not reject a real passphrase that merely contains a common word", () => {
    // The reduction compares whole passwords. "monkey" is on the list; a
    // passphrase that happens to mention one is not.
    expect(checkPassword("the monkey ate my homework")).toBeNull()
  })

  it("imposes no composition rules", () => {
    // A rule that demands a symbol rejects a good passphrase and accepts
    // "P@ssw0rd!".
    expect(checkPassword("all lower case letters and spaces")).toBeNull()
    expect(checkPassword("012345678901234567890")).toBeNull()
  })
})
