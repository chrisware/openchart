// Purpose: Stores each MCP server's secret environment and header values encrypted.

import { Credential } from "@openchart/server/access/credential";
import { Integration } from "@openchart/server/access/integration";
import { Effect, Schema } from "effect";

const SecretBlob = Schema.Struct({
  env: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  headers: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});
export type SecretBlob = typeof SecretBlob.Type;

const integrationID = (serverID: string) =>
  Integration.IntegrationID.make(`mcp:${serverID}`);

/** Reads one server's secret map; absent or unreadable values stay empty. */
export const readMcpSecrets = (
  credentials: Credential.Interface,
  serverID: string,
): Effect.Effect<SecretBlob, never> =>
  credentials.list(integrationID(serverID), true).pipe(
    Effect.map((rows) => {
      const value = rows[0]?.value;
      if (value?.type !== "key") return {};
      try {
        return Schema.decodeUnknownSync(SecretBlob)(JSON.parse(value.key));
      } catch {
        return {};
      }
    }),
    Effect.catch(() => Effect.succeed({})),
  );

/** Atomically replaces one server's secret map. */
export const writeMcpSecrets = (
  credentials: Credential.Interface,
  serverID: string,
  secrets: SecretBlob,
): Effect.Effect<void, Credential.StorageFailed> =>
  credentials
    .create({
      integrationID: integrationID(serverID),
      value: Credential.Key.make({
        type: "key",
        key: JSON.stringify(secrets),
      }),
    })
    .pipe(Effect.asVoid);

/** Removes one server's encrypted secrets without reading them. */
export const clearMcpSecrets = (
  credentials: Credential.Interface,
  serverID: string,
): Effect.Effect<void, Credential.StorageFailed> =>
  credentials.clear(integrationID(serverID));
