import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "better-auth/crypto";

import { hashPasswordForAuth } from "../../scripts/auth-password.mjs";

/**
 * The bootstrap script cannot import Better Auth inside the deployed image, so
 * it reproduces the password format itself. Two definitions of a valid password
 * is a fine way to lock a family out of their own home, and the failure would be
 * silent: the account is created, and only the login says no.
 *
 * These tests make the drift loud instead.
 */
describe("the bootstrap password format matches Better Auth", () => {
  it("produces a hash Better Auth accepts", async () => {
    const hash = await hashPasswordForAuth("ett tillräckligt långt lösenord");

    await expect(
      verifyPassword({ hash, password: "ett tillräckligt långt lösenord" }),
    ).resolves.toBe(true);
  });

  it("produces a hash Better Auth rejects for the wrong password", async () => {
    const hash = await hashPasswordForAuth("rätt lösenord är detta");

    await expect(verifyPassword({ hash, password: "fel lösenord" })).resolves.toBe(false);
  });

  it("agrees with Better Auth about the shape of a stored hash", async () => {
    const ours = await hashPasswordForAuth("lösenord");
    const theirs = await hashPassword("lösenord");

    const [oursSalt, oursKey] = ours.split(":");
    const [theirsSalt, theirsKey] = theirs.split(":");

    expect(oursSalt).toHaveLength(theirsSalt.length);
    expect(oursKey).toHaveLength(theirsKey.length);
    expect(ours).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
  });

  it("normalises the way Better Auth does, so an accent typed two ways still opens", async () => {
    // "å" as one character and as a + combining ring must hash alike.
    const composed = "låsenordet";
    const decomposed = "låsenordet";
    const hash = await hashPasswordForAuth(composed);

    await expect(verifyPassword({ hash, password: decomposed })).resolves.toBe(true);
  });

  it("salts every hash, so two identical passwords do not look identical", async () => {
    const first = await hashPasswordForAuth("samma lösenord");
    const second = await hashPasswordForAuth("samma lösenord");

    expect(first).not.toBe(second);
  });
});
