// Purpose: Connects to one configured MCP server and lists its tools.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { JSONSchema7 } from "@ai-sdk/provider";
import type { McpServerSettings } from "./config";
import type { SecretBlob } from "./credentials";

/** One advertised MCP tool before OpenChart applies naming and permissions. */
export interface McpTool {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: JSONSchema7;
}

/** A connected server, its client, and the current tool catalog. */
export interface McpConnection {
  readonly client: Client;
  readonly tools: readonly McpTool[];
  readonly close: () => Promise<void>;
}

function envFor(settings: McpServerSettings, secrets: SecretBlob) {
  const env = getDefaultEnvironment();
  for (const name of settings.secretEnv) {
    const value = secrets.env?.[name];
    if (value !== undefined) env[name] = value;
  }
  return env;
}

function headersFor(settings: McpServerSettings, secrets: SecretBlob) {
  const headers: Record<string, string> = {};
  for (const name of settings.secretHeaders) {
    const value = secrets.headers?.[name];
    if (value !== undefined) headers[name] = value;
  }
  return headers;
}

/**
 * Connects using the configured transport, completes the MCP handshake, and
 * lists tools. Construction performs no I/O; the caller owns close().
 * @example const connection = await connect(serverID, settings, secrets);
 */
export async function connect(
  serverID: string,
  settings: McpServerSettings,
  secrets: SecretBlob,
): Promise<McpConnection> {
  const client = new Client(
    { name: `openchart-${serverID}`, version: "1.0.0" },
    { capabilities: {} },
  );
  const transport =
    settings.transport === "stdio"
      ? new StdioClientTransport({
          command: settings.command,
          args: settings.args,
          env: envFor(settings, secrets),
          stderr: "inherit",
        })
      : new StreamableHTTPClientTransport(new URL(settings.url), {
          requestInit: { headers: headersFor(settings, secrets) },
        });
  await client.connect(transport);
  const listed = await client.listTools();
  const tools = listed.tools.map((tool) => ({
    name: tool.name,
    title: tool.annotations?.title ?? tool.name,
    description: tool.description ?? tool.name,
    inputSchema: tool.inputSchema as JSONSchema7,
  }));
  return {
    client,
    tools,
    close: async () => {
      await client.close();
    },
  };
}
