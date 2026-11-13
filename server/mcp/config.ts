// Purpose: Declares external MCP server configuration without storing secrets.

import { Schema } from "effect";

/** Server IDs are stable config keys and tool-name prefixes. */
export const McpServerID = Schema.String.check(
  Schema.isPattern(/^[a-z0-9][a-z0-9-]{0,63}$/),
);

const SecretName = Schema.String.check(Schema.isPattern(/^[^\s]+$/));

/**
 * One configured MCP server. The transport fields stay flat so the settings
 * provider can decode this domain without opaque JSON or union encodings.
 */
export const McpServerSettings = Schema.Struct({
  id: McpServerID,
  enabled: Schema.Boolean,
  transport: Schema.Literals(["stdio", "http"]),
  command: Schema.String,
  args: Schema.Array(Schema.String).pipe(Schema.mutable),
  url: Schema.String,
  /** Environment variable names resolved from the server's encrypted secret blob. */
  secretEnv: Schema.Array(SecretName).pipe(Schema.mutable),
  /** HTTP header names resolved from the server's encrypted secret blob. */
  secretHeaders: Schema.Array(SecretName).pipe(Schema.mutable),
  timeoutSeconds: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThan(0),
    Schema.isLessThanOrEqualTo(600),
  ),
});
export type McpServerSettings = typeof McpServerSettings.Type;

/** MCP settings start empty; adding a server is explicit user configuration. */
export const McpSettings = Schema.Struct({
  servers: Schema.Record(Schema.String, McpServerSettings),
});
export type McpSettings = typeof McpSettings.Type;
