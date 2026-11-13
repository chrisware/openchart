import { Effect, Layer } from "effect";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Home } from "@openchart/server/home";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { expect, test, vi } from "vitest";
import * as Tool from "@openchart/server/agent/tool/tool";
import { connect } from "./client";
import { mcpToolInfo } from "./tools";
import { McpTools } from "./service";

test("discovers and calls a stdio MCP tool", async () => {
  const connection = await connect(
    "fake",
    {
      id: "fake",
      enabled: true,
      transport: "stdio",
      command: process.execPath,
      args: [new URL("./fixtures/echo-server.mjs", import.meta.url).pathname],
      url: "",
      secretEnv: [],
      secretHeaders: [],
      timeoutSeconds: 10,
    },
    {},
  );
  try {
    expect(connection.tools.map((tool) => tool.name)).toEqual(["echo"]);
    const definition = await Effect.runPromise(
      Tool.init(
        mcpToolInfo(
          "fake",
          "Fake",
          connection.tools[0]!,
          connection.client,
          10,
        ),
      ),
    );
    const result = await Effect.runPromise(
      definition.execute(
        { text: "hello" },
        {
          rootRunID: "run",
          sessionID: "ses",
          messageID: "msg",
          callID: "call",
          agent: "analyst",
          messages: [],
          metadata: () => Effect.void,
          ask: () => Effect.void,
        },
      ),
    );
    expect(result.output).toEqual({
      type: "content",
      value: [{ type: "text", text: "echo:hello" }],
    });
  } finally {
    await connection.close();
  }
});

test("service discovers and executes configured MCP servers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "openchart-mcp-"));
  await writeFile(
    join(directory, "mcp.json"),
    JSON.stringify({
      servers: {
        fake: {
          id: "fake",
          enabled: true,
          transport: "stdio",
          command: process.execPath,
          args: [
            new URL("./fixtures/echo-server.mjs", import.meta.url).pathname,
          ],
          url: "",
          secretEnv: [],
          secretHeaders: [],
          timeoutSeconds: 10,
        },
      },
    }),
  );
  const layer = McpTools.layer.pipe(
    Layer.provide(Home.layer(directory)),
    Layer.provide(NodeFileSystem.layer),
  );
  const asked = vi.fn(() => Effect.void);
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const service = yield* McpTools.Service;
      const definitions = yield* service.all();
      const status = yield* service.status();
      const definition = definitions[0]!;
      const output = yield* definition.execute(
        { text: "service" },
        {
          rootRunID: "run",
          sessionID: "ses",
          messageID: "msg",
          callID: "call",
          agent: "analyst",
          messages: [],
          metadata: () => Effect.void,
          ask: asked,
        },
      );
      return { definitions, status, output };
    }).pipe(Effect.provide(layer)),
  );
  expect(result.definitions.map((entry) => entry.id)).toEqual([
    "mcp__fake__echo",
  ]);
  expect(result.status).toEqual([
    {
      serverID: "fake",
      transport: "stdio",
      status: "ready",
      toolCount: 1,
    },
  ]);
  expect(result.output.output).toEqual({
    type: "content",
    value: [{ type: "text", text: "echo:service" }],
  });
  expect(asked).toHaveBeenCalledWith(
    expect.objectContaining({
      permission: "mcp__fake__echo",
      metadata: { serverID: "fake", tool: "echo" },
    }),
  );
}, 15000);

test("concurrent status and tool lookup share one connection attempt", async () => {
  const directory = await mkdtemp(join(tmpdir(), "openchart-mcp-race-"));
  await writeFile(
    join(directory, "mcp.json"),
    JSON.stringify({
      servers: {
        fake: {
          id: "fake",
          enabled: true,
          transport: "stdio",
          command: process.execPath,
          args: [
            new URL("./fixtures/echo-server.mjs", import.meta.url).pathname,
          ],
          url: "",
          secretEnv: [],
          secretHeaders: [],
          timeoutSeconds: 10,
        },
      },
    }),
  );
  const layer = McpTools.layer.pipe(
    Layer.provide(Home.layer(directory)),
    Layer.provide(NodeFileSystem.layer),
  );
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const service = yield* McpTools.Service;
      return yield* Effect.all([service.status(), service.all()], {
        concurrency: "unbounded",
      });
    }).pipe(Effect.provide(layer)),
  );
  expect(result[0]).toEqual([
    {
      serverID: "fake",
      transport: "stdio",
      status: "ready",
      toolCount: 1,
    },
  ]);
  expect(result[1].map((entry) => entry.id)).toEqual(["mcp__fake__echo"]);
}, 15000);
