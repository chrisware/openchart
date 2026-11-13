// Purpose: Owns external MCP connections, discovery status, and tool definitions.

export * as McpTools from "./service";

import { Credential } from "@openchart/server/access/credential";
import * as Tool from "@openchart/server/agent/tool/tool";
import { Home } from "@openchart/server/home";
import { Context, Effect, Layer, Option, Result, Semaphore } from "effect";
import type { McpServerSettings } from "./config";
import { connect, type McpConnection } from "./client";
import { readMcpSecrets, type SecretBlob } from "./credentials";
import { readMcpSettings } from "./store";
import { mcpToolInfo } from "./tools";

function settingsKey(settings: McpServerSettings, secrets: SecretBlob) {
  return JSON.stringify([settings, secrets]);
}

/** Keeps the provider's own message instead of Effect's generic wrapper. */
function errorMessage(cause: unknown) {
  let current: unknown = cause;
  let message = "";
  for (let depth = 0; depth < 8 && current !== undefined; depth++) {
    if (current instanceof Error && current.message) message = current.message;
    else if (
      typeof current === "object" &&
      current !== null &&
      "message" in current &&
      typeof current.message === "string"
    )
      message = current.message;
    current =
      typeof current === "object" && current !== null && "cause" in current
        ? current.cause
        : undefined;
  }
  return message || String(cause);
}

/** One Settings-visible server state. */
export type McpServerStatus = {
  readonly serverID: string;
  readonly transport: "stdio" | "http";
  readonly status: "disabled" | "connecting" | "ready" | "error";
  readonly toolCount: number;
  readonly error?: string;
};

type ConfiguredServer = {
  readonly id: string;
  readonly settings: McpServerSettings;
};

type ConnectionState = {
  readonly key: string;
  readonly status: "connecting" | "ready" | "error";
  readonly connection?: McpConnection;
  readonly error?: string;
};

/** Discovery and tool lookup for configured external MCP servers. */
export interface Interface {
  /** Lists tools from every enabled server; failed servers are omitted. */
  readonly all: () => Effect.Effect<readonly Tool.Def[]>;
  /** Reports each configured server without hiding failures. */
  readonly status: () => Effect.Effect<readonly McpServerStatus[]>;
  /** Lists the stored server settings for Settings. */
  readonly configured: () => Effect.Effect<readonly McpServerSettings[]>;
  /** Drops one connection, or all connections, so the next call reconnects. */
  readonly refresh: (serverID?: string) => Effect.Effect<void>;
}

/** External MCP tool service; configuration changes are observed per call. */
export class Service extends Context.Service<Service, Interface>()(
  "@openchart/server/McpTools",
) {}

/**
 * Supplies lazy MCP discovery. Connections live for the service scope and are
 * replaced when their config or secrets change.
 * @example const layer = McpTools.layer;
 */
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const home = yield* Home;
    const credentials = yield* Effect.serviceOption(Credential.Service);
    const connections = new Map<string, ConnectionState>();
    // Serialize discovery so concurrent status and prompt reads share one
    // connection attempt instead of observing a transient "connecting" state.
    const gate = Semaphore.makeUnsafe(1);

    const close = (serverID: string) =>
      Effect.gen(function* () {
        const current = connections.get(serverID);
        connections.delete(serverID);
        if (current?.connection)
          yield* Effect.tryPromise(() => current.connection!.close()).pipe(
            Effect.catch(() => Effect.void),
          );
      });

    const readSecrets = (serverID: string) =>
      Option.isSome(credentials)
        ? readMcpSecrets(credentials.value, serverID)
        : Effect.succeed({});

    const ensureUnlocked = (server: ConfiguredServer) =>
      Effect.gen(function* () {
        const secrets = yield* readSecrets(server.id);
        const key = settingsKey(server.settings, secrets);
        const existing = connections.get(server.id);
        if (existing?.key === key) return existing;
        if (existing) yield* close(server.id);
        connections.set(server.id, { key, status: "connecting" });

        const result = yield* Effect.tryPromise(() =>
          connect(server.id, server.settings, secrets),
        ).pipe(Effect.result);

        if (Result.isFailure(result)) {
          const error = errorMessage(result.failure);
          const state: ConnectionState = { key, status: "error", error };
          connections.set(server.id, state);
          return state;
        }
        const state: ConnectionState = {
          key,
          status: "ready",
          connection: result.success,
        };
        connections.set(server.id, state);
        return state;
      });
    const ensure = (server: ConfiguredServer) =>
      gate.withPermit(ensureUnlocked(server));

    const configured = readMcpSettings.pipe(
      Effect.provideService(Home, home),
      Effect.map((settings) => Object.values(settings.servers)),
      Effect.mapError(() => [] as McpServerSettings[]),
    );
    const servers = configured.pipe(
      Effect.map((settings) =>
        settings.map((value) => ({ id: value.id, settings: value })),
      ),
      Effect.catch(() => Effect.succeed([])),
    );

    const all = Effect.fn("McpTools.all")(function* () {
      const configured = yield* servers;
      const definitions: Tool.Def[] = [];
      for (const server of configured) {
        if (!server.settings.enabled) continue;
        const state = yield* ensure(server);
        if (state.status !== "ready" || !state.connection) continue;
        for (const tool of state.connection.tools)
          definitions.push(
            (yield* Tool.init(
              mcpToolInfo(
                server.id,
                server.id,
                tool,
                state.connection.client,
                server.settings.timeoutSeconds,
              ),
            ).pipe(Effect.orDie)) as Tool.Def,
          );
      }
      return definitions;
    });

    const status = Effect.fn("McpTools.status")(function* () {
      const configured = yield* servers;
      const result: McpServerStatus[] = [];
      for (const server of configured) {
        if (!server.settings.enabled) {
          result.push({
            serverID: server.id,
            transport: server.settings.transport,
            status: "disabled",
            toolCount: 0,
          });
          continue;
        }
        const state = yield* ensure(server);
        result.push({
          serverID: server.id,
          transport: server.settings.transport,
          status: state.status,
          toolCount: state.connection?.tools.length ?? 0,
          ...(state.error === undefined ? {} : { error: state.error }),
        });
      }
      return result;
    });

    yield* Effect.addFinalizer(() =>
      Effect.promise(async () => {
        await Promise.allSettled(
          [...connections.values()].flatMap((state) =>
            state.connection ? [state.connection.close()] : [],
          ),
        );
      }),
    );

    return Service.of({
      all,
      status,
      configured: () => configured.pipe(Effect.catch(() => Effect.succeed([]))),
      refresh: (serverID) =>
        serverID === undefined
          ? Effect.forEach([...connections.keys()], (id) => close(id), {
              discard: true,
            })
          : close(serverID),
    });
  }),
);

/** Empty catalog for consumers that do not configure MCP. */
export const layerDefault = Layer.succeed(Service, {
  all: () => Effect.succeed([]),
  status: () => Effect.succeed([]),
  configured: () => Effect.succeed([]),
  refresh: () => Effect.void,
});
