// Purpose: Reads and atomically replaces the user-owned MCP server catalog.

import { Home } from "@openchart/server/home";
import { Effect, Schema } from "effect";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { McpSettings } from "./config";

export class McpStoreFailed extends Schema.TaggedError<McpStoreFailed>()(
  "MCP.StoreFailed",
  { message: Schema.String, cause: Schema.Defect() },
) {}

const filename = (root: string) => join(root, "mcp.json");

/** Reads mcp.json; absence means no servers. Malformed files fail loudly. */
export const readMcpSettings = Effect.gen(function* () {
  const { root } = yield* Home;
  const content = yield* Effect.tryPromise({
    try: () => readFile(filename(root), "utf8"),
    catch: (cause) => cause,
  }).pipe(
    Effect.catchIf(
      (cause) =>
        typeof cause === "object" &&
        cause !== null &&
        "code" in cause &&
        cause.code === "ENOENT",
      () => Effect.succeed(undefined),
    ),
    Effect.mapError(
      (cause) =>
        new McpStoreFailed({
          message: "Could not read mcp.json.",
          cause,
        }),
    ),
  );
  if (content === undefined) return { servers: {} } satisfies McpSettings;
  return yield* Effect.try({
    try: () => Schema.decodeUnknownSync(McpSettings)(JSON.parse(content)),
    catch: (cause) =>
      new McpStoreFailed({ message: "mcp.json is invalid.", cause }),
  });
});

/** Atomically replaces mcp.json so readers never see a partial catalog. */
export const writeMcpSettings = (settings: McpSettings) =>
  Effect.gen(function* () {
    const { root } = yield* Home;
    const target = filename(root);
    const staging = `${target}.${crypto.randomUUID()}`;
    yield* Effect.tryPromise({
      try: async () => {
        await mkdir(dirname(target), { recursive: true });
        await writeFile(staging, `${JSON.stringify(settings, null, 2)}\n`, {
          mode: 0o600,
        });
        await rename(staging, target);
      },
      catch: (cause) =>
        new McpStoreFailed({ message: "Could not save mcp.json.", cause }),
    }).pipe(
      Effect.ensuring(
        Effect.promise(() => rm(staging, { force: true })).pipe(
          Effect.catch(() => Effect.void),
        ),
      ),
    );
  });
