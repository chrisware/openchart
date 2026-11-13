// Purpose: Exposes MCP server status, reconnects, and encrypted secret writes.

import { Credential } from "@openchart/server/access/credential";
import { trpc } from "@openchart/server/lib/trpc";
import { Effect, Schema } from "effect";
import { clearMcpSecrets, writeMcpSecrets } from "./credentials";
import { McpServerID, McpServerSettings } from "./config";
import { readMcpSettings, writeMcpSettings } from "./store";
import { McpTools } from "./service";

const input = <S extends Schema.ConstraintDecoder<unknown, never>>(schema: S) =>
  Schema.toStandardSchemaV1(schema, {
    parseOptions: { onExcessProperty: "error" },
  });

const secrets = Schema.Struct({
  serverID: McpServerID,
  env: Schema.Record(Schema.String, Schema.String).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed({})),
  ),
  headers: Schema.Record(Schema.String, Schema.String).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed({})),
  ),
});

/** MCP Settings reads the stored catalog, status, and encrypted secrets. */
export const mcpRouter = trpc.router({
  list: trpc.procedure.query(({ ctx }) =>
    ctx.runtime.runPromise(McpTools.Service.use((tools) => tools.configured())),
  ),
  setServer: trpc.procedure
    .input(input(Schema.Struct({ server: McpServerSettings })))
    .mutation(({ ctx, input }) =>
      ctx.runtime.runPromise(
        Effect.gen(function* () {
          const current = yield* readMcpSettings;
          yield* writeMcpSettings({
            servers: { ...current.servers, [input.server.id]: input.server },
          });
          yield* McpTools.Service.use((tools) =>
            tools.refresh(input.server.id),
          );
        }),
      ),
    ),
  removeServer: trpc.procedure
    .input(input(Schema.Struct({ serverID: McpServerID })))
    .mutation(({ ctx, input }) =>
      ctx.runtime.runPromise(
        Effect.gen(function* () {
          const current = yield* readMcpSettings;
          const servers = { ...current.servers };
          delete servers[input.serverID];
          yield* writeMcpSettings({ servers });
          yield* McpTools.Service.use((tools) => tools.refresh(input.serverID));
        }),
      ),
    ),
  status: trpc.procedure.query(({ ctx }) =>
    ctx.runtime.runPromise(McpTools.Service.use((tools) => tools.status())),
  ),
  refresh: trpc.procedure
    .input(
      input(
        Schema.Struct({
          serverID: Schema.optionalKey(McpServerID),
        }),
      ),
    )
    .mutation(({ ctx, input }) =>
      ctx.runtime.runPromise(
        McpTools.Service.use((tools) => tools.refresh(input.serverID)),
      ),
    ),
  setSecrets: trpc.procedure.input(input(secrets)).mutation(({ ctx, input }) =>
    ctx.runtime.runPromise(
      Credential.Service.use((credentials) =>
        writeMcpSecrets(credentials, input.serverID, {
          env: input.env,
          headers: input.headers,
        }).pipe(
          Effect.andThen(
            McpTools.Service.use((tools) => tools.refresh(input.serverID)),
          ),
        ),
      ),
    ),
  ),
  clearSecrets: trpc.procedure
    .input(input(Schema.Struct({ serverID: McpServerID })))
    .mutation(({ ctx, input }) =>
      ctx.runtime.runPromise(
        Credential.Service.use((credentials) =>
          clearMcpSecrets(credentials, input.serverID).pipe(
            Effect.andThen(
              McpTools.Service.use((tools) => tools.refresh(input.serverID)),
            ),
          ),
        ),
      ),
    ),
});
