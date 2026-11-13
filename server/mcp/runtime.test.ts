import { temporaryHome } from "@openchart/server/home.test-utils";
import { ConfigProvider, Effect, Option } from "effect";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";
import { catalogLayer } from "@openchart/server/data";
import { makeRuntime } from "@openchart/server/runtime";
import { McpTools } from "./service";

test("runtime exposes McpTools and its configured definitions", async () => {
  const home = temporaryHome();
  await writeFile(
    join(home, "mcp.json"),
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
  const runtime = makeRuntime({
    home,
    databasePath: ":memory:",
    config: ConfigProvider.fromUnknown({}),
    datasets: catalogLayer(Effect.succeed([])),
    models: { fetchEnabled: false, userAgent: "OpenChart/McpRuntimeTest" },
  });
  try {
    const result = await runtime.runPromise(
      Effect.gen(function* () {
        const service = yield* Effect.serviceOption(McpTools.Service);
        if (Option.isNone(service)) return { present: false, ids: [] };
        const ids = (yield* service.value.all()).map((def) => def.id);
        return { present: true, ids };
      }),
    );
    expect(result).toEqual({ present: true, ids: ["mcp__fake__echo"] });
  } finally {
    await runtime.dispose();
  }
}, 20000);
