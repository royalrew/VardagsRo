import { randomBytes, scrypt } from "node:crypto";

/**
 * The password format Better Auth stores, reimplemented with node:crypto alone.
 *
 * The bootstrap script has to run inside the deployed image, where Better Auth
 * is bundled into the application rather than installed as a package it could
 * import. Rather than reshape the whole build around one script, the format is
 * reproduced here — it is small, stable and entirely standard scrypt.
 *
 * The obvious danger is two definitions of a valid password drifting apart.
 * `auth-password.test.ts` therefore hashes with this code and verifies with
 * Better Auth's own, and fails the day the two stop agreeing.
 */
const SCRYPT = { N: 16384, r: 16, p: 1, dkLen: 64 };

function derive(password, salt) {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      SCRYPT.dkLen,
      { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 128 * SCRYPT.N * SCRYPT.r * 2 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

export async function hashPasswordForAuth(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt);
  return `${salt}:${key.toString("hex")}`;
}
