// Purpose: Defines expected MCP tool failures.

import { Schema } from "effect";

/** The MCP server rejected a tool call or returned an error result. */
export class McpToolFailed extends Schema.TaggedError<McpToolFailed>()(
  "MCP.ToolFailed",
  {
    serverID: Schema.String,
    tool: Schema.String,
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}

/** A configured MCP server could not connect or list tools. */
export class McpServerUnavailable extends Schema.TaggedError<McpServerUnavailable>()(
  "MCP.ServerUnavailable",
  {
    serverID: Schema.String,
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}
