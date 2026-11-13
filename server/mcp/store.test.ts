// Purpose: Verifies the user-owned MCP catalog is read and replaced atomically.

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { Home } from "@openchart/server/home";
import { Effect, Layer } from "effect";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { readMcpSettings, writeMcpSettings } from "./store";

test("round-trips the MCP catalog", async () => {
  const directory = await mkdtemp(join(tmpdir(), "openchart-mcp-store-"));
  const layer = Home.layer(directory).pipe(Layer.provide(NodeFileSystem.layer));
  expect(
    await Effect.runPromise(readMcpSettings.pipe(Effect.provide(layer))),
  ).toEqual({ servers: {} });
  const settings = {
    servers: {
      composio: {
        id: "composio",
        enabled: true,
        transport: "http" as const,
        command: "",
        args: [],
        url: "https://connect.composio.dev/mcp",
        secretEnv: [],
        secretHeaders: ["x-consumer-api-key"],
        timeoutSeconds: 120,
      },
    },
  };
  await Effect.runPromise(
    writeMcpSettings(settings).pipe(Effect.provide(layer)),
  );
  const stored = await readFile(join(directory, "mcp.json"), "utf8");
  expect(JSON.parse(stored)).toEqual(settings);
  expect(
    await Effect.runPromise(readMcpSettings.pipe(Effect.provide(layer))),
  ).toEqual(settings);
});
