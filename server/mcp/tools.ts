// Purpose: Adapts one MCP tool to OpenChart's Agent tool contract.

import type {
  ToolModelContent,
  ToolModelOutput,
} from "@openchart/server/agent/contracts/part";
import * as Tool from "@openchart/server/agent/tool/tool";
import { Effect, Schema } from "effect";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpToolFailed } from "./errors";
import type { McpTool } from "./client";

const MAX_DESCRIPTION = 4_000;

/** Stable model-safe identity for one server tool. */
export function mcpToolID(serverID: string, toolName: string) {
  const slug = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
  return `mcp__${slug(serverID)}__${slug(toolName) || "tool"}`;
}

function dataURI(mimeType: string, data: string) {
  return `data:${mimeType};base64,${data}`;
}

type ToolResult = {
  readonly content: readonly unknown[];
  readonly structuredContent?: unknown;
  readonly isError?: boolean;
};

function toolResult(value: unknown): ToolResult {
  if (typeof value !== "object" || value === null) return { content: [] };
  const record = value as Record<string, unknown>;
  return {
    content: Array.isArray(record.content) ? record.content : [],
    ...(record.structuredContent === undefined
      ? {}
      : { structuredContent: record.structuredContent }),
    ...(record.isError === true ? { isError: true } : {}),
  };
}

function textFromResult(result: ToolResult) {
  const parts = result.content;
  const text = parts
    .filter(
      (part): part is { type: "text"; text: string } =>
        typeof part === "object" &&
        part !== null &&
        (part as { type?: unknown }).type === "text" &&
        typeof (part as { text?: unknown }).text === "string",
    )
    .map((part) => part.text)
    .join("\n");
  if (text) return text;
  if (result.structuredContent !== undefined)
    return JSON.stringify(result.structuredContent);
  return "";
}

function outputFromResult(result: ToolResult): {
  output: ToolModelOutput;
  attachments: Tool.Attachment[];
} {
  const content: ToolModelContent[] = [];
  const attachments: Tool.Attachment[] = [];
  for (const raw of result.content) {
    if (typeof raw !== "object" || raw === null) continue;
    const part = raw as Record<string, unknown>;
    if (part.type === "text" && typeof part.text === "string") {
      content.push({ type: "text", text: part.text });
      continue;
    }
    if (
      (part.type === "image" || part.type === "audio") &&
      typeof part.data === "string" &&
      typeof part.mimeType === "string"
    ) {
      content.push({
        type: "media",
        mediaType: part.mimeType,
        data: part.data,
      });
      attachments.push({
        type: "file",
        mime: part.mimeType,
        url: dataURI(part.mimeType, part.data),
      });
      continue;
    }
    if (part.type === "resource" && typeof part.resource === "object") {
      const resource = part.resource as Record<string, unknown>;
      if (typeof resource.text === "string") {
        content.push({ type: "text", text: resource.text });
      } else if (
        typeof resource.blob === "string" &&
        typeof resource.mimeType === "string"
      ) {
        content.push({
          type: "media",
          mediaType: resource.mimeType,
          data: resource.blob,
        });
        attachments.push({
          type: "file",
          mime: resource.mimeType,
          url: dataURI(resource.mimeType, resource.blob),
        });
      }
      continue;
    }
    if (part.type === "resource_link" && typeof part.uri === "string") {
      content.push({
        type: "text",
        text: `[${String(part.name ?? part.uri)}](${part.uri})`,
      });
      continue;
    }
    content.push({ type: "text", text: JSON.stringify(part) });
  }
  if (content.length > 0)
    return { output: { type: "content", value: content }, attachments };
  if (result.structuredContent !== undefined) {
    const decoded = Schema.decodeUnknownOption(Schema.Json)(
      result.structuredContent,
    );
    if (decoded._tag === "Some")
      return { output: { type: "json", value: decoded.value }, attachments };
    return {
      output: {
        type: "text",
        value: JSON.stringify(result.structuredContent),
      },
      attachments,
    };
  }
  return { output: { type: "text", value: "" }, attachments };
}

/**
 * Builds one lazy tool definition bound to a connected MCP client. Execution
 * asks OpenChart's permission service before forwarding the call.
 * @example const info = mcpToolInfo("composio", "Composio", tool, client, 120);
 */
export function mcpToolInfo(
  serverID: string,
  serverName: string,
  tool: McpTool,
  client: Client,
  timeoutSeconds: number,
): Tool.Info {
  const id = mcpToolID(serverID, tool.name);
  const description = `MCP ${serverName}: ${tool.description}`.slice(
    0,
    MAX_DESCRIPTION,
  );
  return {
    id,
    init: () =>
      Effect.succeed({
        id,
        description,
        parameters: Schema.Unknown,
        inputSchema: tool.inputSchema,
        execute: <RContext>(
          args: unknown,
          ctx: Tool.Context<Tool.Metadata, RContext>,
        ) =>
          Effect.gen(function* () {
            yield* ctx.ask({
              permission: id,
              patterns: ["*"],
              always: ["*"],
              metadata: { serverID, tool: tool.name },
            });
            const result = yield* Effect.tryPromise({
              try: async (signal) =>
                toolResult(
                  await client.callTool(
                    {
                      name: tool.name,
                      arguments: args as Record<string, unknown>,
                    },
                    undefined,
                    { signal, timeout: timeoutSeconds * 1000 },
                  ),
                ),
              catch: (cause) =>
                new McpToolFailed({
                  serverID,
                  tool: tool.name,
                  message:
                    cause instanceof Error ? cause.message : String(cause),
                  cause,
                }),
            });
            if (result.isError)
              return yield* Effect.fail(
                new McpToolFailed({
                  serverID,
                  tool: tool.name,
                  message: textFromResult(result) || "MCP tool failed",
                  cause: new Error("MCP tool returned isError"),
                }),
              );
            const { output, attachments } = outputFromResult(result);
            return {
              title: `${serverName}: ${tool.title}`,
              metadata: { serverID, tool: tool.name },
              output,
              ...(attachments.length === 0 ? {} : { attachments }),
            };
          }),
      }),
  };
}
