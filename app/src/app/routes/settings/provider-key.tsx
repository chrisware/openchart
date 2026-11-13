// Purpose: Saves one HTTP provider's API key through encrypted Credential storage.
import { useState } from "react";
import type { ApiProviderID } from "@openchart/models/model-tiers";
import { Button } from "@openchart/app/components/ui/button";
import { SecretInput } from "@openchart/app/components/ui/secret-input";
import type { AppTransport } from "@openchart/app/lib/transport/transport";

/**
 * Masked key entry shared by the hosted API provider rows. The saved key is
 * never returned to the renderer; `onChanged` refreshes discovery.
 * @example
 * <ProviderKeyControl transport={transport} providerID={OPENCODE_GO} />
 */
export function ProviderKeyControl({
  transport,
  providerID,
  disabled = false,
  onChanged,
}: {
  transport: AppTransport;
  providerID: ApiProviderID;
  disabled?: boolean;
  onChanged?: () => Promise<unknown> | void;
}) {
  const [keyDraft, setKeyDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "cleared" | "error">(
    "idle",
  );
  const save = async () => {
    const key = keyDraft.trim();
    if (!key) return;
    setSaving(true);
    try {
      await transport.rpc.models.setApiKey.mutate({ providerID, key });
      setKeyDraft("");
      setStatus("saved");
      await onChanged?.();
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  };
  const clear = async () => {
    setSaving(true);
    try {
      await transport.rpc.models.clearApiKey.mutate({ providerID });
      setKeyDraft("");
      setStatus("cleared");
      await onChanged?.();
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex w-full items-center gap-2">
        <SecretInput
          aria-label="API key"
          placeholder="sk-…"
          value={keyDraft}
          disabled={disabled || saving}
          onChange={(event) => {
            setKeyDraft(event.currentTarget.value);
            setStatus("idle");
          }}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || saving || !keyDraft.trim()}
          onClick={() => void save()}
        >
          Save key
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || saving}
          onClick={() => void clear()}
        >
          Clear
        </Button>
      </div>
      {status !== "idle" ? (
        <p
          role="status"
          className={
            status === "error"
              ? "text-xs text-destructive"
              : "text-xs text-muted-foreground"
          }
        >
          {status === "saved"
            ? "API key saved."
            : status === "cleared"
              ? "API key cleared."
              : "Couldn’t save the API key."}
        </p>
      ) : null}
    </div>
  );
}
