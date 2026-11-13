// Purpose: Verifies encrypted provider-key storage through Credential.
import { randomBytes } from "node:crypto";
import { Credential } from "@openchart/server/access/credential";
import { jweEncryption } from "@openchart/server/access/credential/encryption";
import { Database } from "@openchart/server/db";
import { Effect, Layer } from "effect";
import { expect, test } from "vitest";
import { clearModelKey, readModelKey, writeModelKey } from "./credentials";

const storage = Credential.layer(jweEncryption(randomBytes(32))).pipe(
  Layer.provideMerge(Database.layer(":memory:", () => Effect.void)),
);

test("stores, replaces, reads, and clears one provider key", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const credentials = yield* Credential.Service;
      expect(yield* readModelKey(credentials, "deepinfra")).toBeUndefined();
      yield* writeModelKey(credentials, "deepinfra", "first");
      expect(yield* readModelKey(credentials, "deepinfra")).toBe("first");
      yield* writeModelKey(credentials, "deepinfra", "second");
      expect(yield* readModelKey(credentials, "deepinfra")).toBe("second");
      yield* clearModelKey(credentials, "deepinfra");
      expect(yield* readModelKey(credentials, "deepinfra")).toBeUndefined();
    }).pipe(Effect.provide(storage)),
  );
});
