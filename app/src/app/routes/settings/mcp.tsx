// Purpose: Configure external MCP servers and their encrypted secret fields.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router";
import { Plus, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@openchart/app/components/ui/button";
import { Input } from "@openchart/app/components/ui/input";
import { Card, CardItem } from "@openchart/app/components/ui/settings/card";
import { DropdownControl } from "@openchart/app/components/ui/settings/dropdown-control";
import { Switch } from "@openchart/app/components/ui/form/switch";
import type { AppRouteContext } from "@openchart/app/app/route-context";
import { SettingsPage } from "./settings-page";

type ServerConfig = {
  id: string;
  enabled: boolean;
  transport: "stdio" | "http";
  command: string;
  args: string[];
  url: string;
  secretEnv: string[];
  secretHeaders: string[];
  timeoutSeconds: number;
};

type Status = {
  serverID: string;
  transport: "stdio" | "http";
  status: "disabled" | "connecting" | "ready" | "error";
  toolCount: number;
  error?: string;
};

const SERVER_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

function StatusBadge({ status }: { status: Status | undefined }) {
  if (!status)
    return <span className="text-xs text-muted-foreground">Checking…</span>;
  if (status.status === "ready")
    return (
      <span className="text-xs text-muted-foreground">
        {status.toolCount} tool{status.toolCount === 1 ? "" : "s"}
      </span>
    );
  if (status.status === "error")
    return (
      <span role="alert" className="text-xs text-destructive">
        {status.error ?? "Connection failed."}
      </span>
    );
  return (
    <span className="text-xs text-muted-foreground">
      {status.status === "disabled" ? "Disabled" : "Connecting…"}
    </span>
  );
}

/** Manage external MCP servers; status and secrets stay outside settings.json.
 * @example <McpSettings />
 */
export default function McpSettings() {
  const { transport } = useOutletContext<AppRouteContext>();
  const list = useQuery({
    queryKey: ["mcp", "list", transport.url],
    queryFn: () => transport.rpc.mcp.list.query(),
    retry: false,
  });
  const status = useQuery({
    queryKey: ["mcp", "status", transport.url],
    queryFn: () => transport.rpc.mcp.status.query(),
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.some((entry) => entry.status === "connecting")
        ? 1000
        : false,
  });
  const servers = list.data ?? [];
  const byID = new Map(
    (status.data ?? []).map((entry) => [entry.serverID, entry]),
  );
  const [draft, setDraft] = useState({
    id: "",
    type: "http" as "http" | "stdio",
    command: "",
    args: "",
    url: "",
    secretEnv: "",
    secretHeaders: "",
    envValue: "",
    headerValue: "",
    timeoutSeconds: "120",
  });
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | undefined>(undefined);
  const disabled = list.isPending || list.isError;

  const updateServer = async (id: string, value: ServerConfig | null) => {
    setBusy(id);
    try {
      if (value === null)
        await transport.rpc.mcp.removeServer.mutate({ serverID: id });
      else await transport.rpc.mcp.setServer.mutate({ server: value });
      await Promise.all([list.refetch(), status.refetch()]);
    } finally {
      setBusy(undefined);
    }
  };

  const add = async () => {
    const id = draft.id.trim();
    if (!SERVER_ID.test(id) || servers.some((server) => server.id === id))
      return;
    const timeoutSeconds = Number(draft.timeoutSeconds);
    const value: ServerConfig = {
      id,
      enabled: true,
      transport: draft.type,
      command: draft.type === "stdio" ? draft.command.trim() : "",
      args:
        draft.type === "stdio" && draft.args.trim()
          ? draft.args.trim().split(/\s+/)
          : [],
      url: draft.type === "http" ? draft.url.trim() : "",
      secretEnv: draft.secretEnv.trim()
        ? draft.secretEnv
            .split(",")
            .map((name) => name.trim())
            .filter(Boolean)
        : [],
      secretHeaders: draft.secretHeaders.trim()
        ? draft.secretHeaders
            .split(",")
            .map((name) => name.trim())
            .filter(Boolean)
        : [],
      timeoutSeconds:
        Number.isInteger(timeoutSeconds) && timeoutSeconds > 0
          ? timeoutSeconds
          : 120,
    };
    await updateServer(id, value);
    const envName = value.secretEnv[0];
    const headerName = value.secretHeaders[0];
    const env = envName && draft.envValue ? { [envName]: draft.envValue } : {};
    const headers =
      headerName && draft.headerValue
        ? { [headerName]: draft.headerValue }
        : {};
    if (Object.keys(env).length || Object.keys(headers).length) {
      await transport.rpc.mcp.setSecrets.mutate({
        serverID: id,
        env,
        headers,
      });
      await status.refetch();
    }
    setDraft({
      id: "",
      type: "http",
      command: "",
      args: "",
      url: "",
      secretEnv: "",
      secretHeaders: "",
      envValue: "",
      headerValue: "",
      timeoutSeconds: "120",
    });
  };

  const saveSecrets = async (id: string, server: ServerConfig) => {
    setBusy(id);
    try {
      const env: Record<string, string> = {};
      const headers: Record<string, string> = {};
      for (const name of server.secretEnv) {
        const value = secrets[`env:${id}:${name}`];
        if (value !== undefined && value !== "") env[name] = value;
      }
      for (const name of server.secretHeaders) {
        const value = secrets[`headers:${id}:${name}`];
        if (value !== undefined && value !== "") headers[name] = value;
      }
      await transport.rpc.mcp.setSecrets.mutate({ serverID: id, env, headers });
      await status.refetch();
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <SettingsPage title="Tools">
      <Card title="MCP servers">
        {servers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No MCP servers configured. Add a local stdio server or a remote
            streamable HTTP server below.
          </p>
        ) : null}
        <div className="space-y-6">
          {servers.map((server) => {
            const id = server.id;
            return (
              <section
                key={id}
                aria-label={`MCP server ${id}`}
                className="space-y-3"
              >
                <CardItem
                  title={id}
                  description={
                    server.transport === "stdio"
                      ? `stdio: ${server.command}`
                      : server.url
                  }
                  actions={
                    <div className="flex items-center gap-3">
                      <StatusBadge status={byID.get(id)} />
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Reconnect ${id}`}
                        disabled={busy === id}
                        onClick={async () => {
                          setBusy(id);
                          try {
                            await transport.rpc.mcp.refresh.mutate({
                              serverID: id,
                            });
                            await status.refetch();
                          } finally {
                            setBusy(undefined);
                          }
                        }}
                      >
                        <RefreshCw aria-hidden="true" className="size-4" />
                      </Button>
                      <Switch
                        aria-label={`Enable ${id}`}
                        checked={server.enabled}
                        disabled={disabled || busy === id}
                        onCheckedChange={(enabled) =>
                          void updateServer(id, { ...server, enabled })
                        }
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove ${id}`}
                        disabled={disabled || busy === id}
                        onClick={() => void updateServer(id, null)}
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                      </Button>
                    </div>
                  }
                />
                {server.secretEnv.length + server.secretHeaders.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Enter values below, then Save secrets.
                    </p>
                    {server.secretEnv.map((name) => (
                      <Input
                        key={`env:${name}`}
                        aria-label={`${id} environment ${name}`}
                        placeholder={`Environment ${name}`}
                        type="password"
                        value={secrets[`env:${id}:${name}`] ?? ""}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setSecrets((current) => ({
                            ...current,
                            [`env:${id}:${name}`]: value,
                          }));
                        }}
                      />
                    ))}
                    {server.secretHeaders.map((name) => (
                      <Input
                        key={`headers:${name}`}
                        aria-label={`${id} header ${name}`}
                        placeholder={`Header ${name}`}
                        type="password"
                        value={secrets[`headers:${id}:${name}`] ?? ""}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setSecrets((current) => ({
                            ...current,
                            [`headers:${id}:${name}`]: value,
                          }));
                        }}
                      />
                    ))}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={disabled || busy === id}
                      onClick={() => void saveSecrets(id, server)}
                    >
                      Save secrets
                    </Button>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      </Card>

      <Card title="Add MCP server">
        <CardItem
          title="Server ID"
          htmlFor="mcp-id"
          description="Lowercase letters, digits and hyphens. Used as the tool prefix."
          actions={
            <Input
              id="mcp-id"
              value={draft.id}
              disabled={disabled}
              placeholder="composio"
              onChange={(event) => {
                const value = event.currentTarget.value;
                setDraft((current) => ({ ...current, id: value }));
              }}
            />
          }
        />
        <CardItem
          title="Transport"
          htmlFor="mcp-transport"
          actions={
            <DropdownControl
              id="mcp-transport"
              aria-label="MCP transport"
              value={draft.type}
              options={[
                { value: "http", name: "Streamable HTTP" },
                { value: "stdio", name: "Local stdio" },
              ]}
              disabled={disabled}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  type: value as "http" | "stdio",
                }))
              }
            />
          }
        />
        {draft.type === "http" ? (
          <CardItem
            title="URL"
            htmlFor="mcp-url"
            actions={
              <Input
                id="mcp-url"
                value={draft.url}
                disabled={disabled}
                placeholder="https://connect.composio.dev/mcp"
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setDraft((current) => ({ ...current, url: value }));
                }}
              />
            }
          />
        ) : (
          <>
            <CardItem
              title="Command"
              htmlFor="mcp-command"
              actions={
                <Input
                  id="mcp-command"
                  value={draft.command}
                  disabled={disabled}
                  placeholder="npx"
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setDraft((current) => ({ ...current, command: value }));
                  }}
                />
              }
            />
            <CardItem
              title="Arguments"
              htmlFor="mcp-args"
              actions={
                <Input
                  id="mcp-args"
                  value={draft.args}
                  disabled={disabled}
                  placeholder="-y @modelcontextprotocol/server-filesystem /path"
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setDraft((current) => ({ ...current, args: value }));
                  }}
                />
              }
            />
          </>
        )}
        <CardItem
          title="Secret environment names"
          htmlFor="mcp-env"
          description="Comma-separated names; values are stored encrypted after adding."
          actions={
            <Input
              id="mcp-env"
              value={draft.secretEnv}
              disabled={disabled}
              placeholder="GITHUB_TOKEN"
              onChange={(event) => {
                const value = event.currentTarget.value;
                setDraft((current) => ({ ...current, secretEnv: value }));
              }}
            />
          }
        />
        <CardItem
          title="Secret header names"
          htmlFor="mcp-headers"
          description="Comma-separated names for HTTP servers."
          actions={
            <Input
              id="mcp-headers"
              value={draft.secretHeaders}
              disabled={disabled}
              placeholder="x-consumer-api-key"
              onChange={(event) => {
                const value = event.currentTarget.value;
                setDraft((current) => ({ ...current, secretHeaders: value }));
              }}
            />
          }
        />
        <CardItem
          title="Environment value"
          htmlFor="mcp-env-value"
          description="Stored encrypted after adding; applies to the first environment name."
          actions={
            <Input
              id="mcp-env-value"
              type="password"
              value={draft.envValue}
              disabled={disabled}
              placeholder="Value for the first environment name"
              onChange={(event) => {
                const value = event.currentTarget.value;
                setDraft((current) => ({ ...current, envValue: value }));
              }}
            />
          }
        />
        <CardItem
          title="Header value"
          htmlFor="mcp-header-value"
          description="Stored encrypted after adding; applies to the first header name."
          actions={
            <Input
              id="mcp-header-value"
              type="password"
              value={draft.headerValue}
              disabled={disabled}
              placeholder="Value for the first header name"
              onChange={(event) => {
                const value = event.currentTarget.value;
                setDraft((current) => ({ ...current, headerValue: value }));
              }}
            />
          }
        />
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            disabled={disabled || !SERVER_ID.test(draft.id.trim())}
            onClick={() => void add()}
          >
            <Plus aria-hidden="true" className="size-4" />
            Add server
          </Button>
        </div>
      </Card>
    </SettingsPage>
  );
}
