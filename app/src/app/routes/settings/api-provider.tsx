// Purpose: Configure a hosted API provider's fixed endpoint and encrypted key.
import {
  DEEPINFRA,
  OPENCODE_GO,
  type ApiProviderID,
} from "@openchart/models/model-tiers";
import { CardItem } from "@openchart/app/components/ui/settings/card";
import type { AppTransport } from "@openchart/app/lib/transport/transport";
import type { useConfig } from "@openchart/app/hooks/use-config";
import { useNativeProvider } from "./native-provider";
import { ProviderKeyControl } from "./provider-key";

const DETAILS: Readonly<
  Record<ApiProviderID, { readonly name: string; readonly baseURL: string }>
> = {
  [DEEPINFRA]: {
    name: "DeepInfra",
    baseURL: "https://api.deepinfra.com/v1/openai",
  },
  [OPENCODE_GO]: {
    name: "OpenCode Go",
    baseURL: "https://opencode.ai/inference/go/openai/v1",
  },
};

/**
 * Hosted providers fix their endpoint in code; only the encrypted key is
 * configurable.
 * @example <ApiProviderSettings transport={transport} settings={settings} providerID={DEEPINFRA} />
 */
export function ApiProviderSettings({
  transport,
  settings,
  providerID,
}: {
  transport: AppTransport;
  settings: ReturnType<typeof useConfig>;
  providerID: ApiProviderID;
}) {
  const config = settings.config?.models.providers[providerID];
  const { discovery } = useNativeProvider(providerID, transport);
  if (!config) return null;
  const { name, baseURL } = DETAILS[providerID];
  return (
    <div className="mt-3 space-y-3 border-t border-border/40 pt-3">
      <CardItem
        title="Endpoint"
        description={
          <>
            {name} inference at <code>{baseURL}</code>.
          </>
        }
      />
      <CardItem
        title="API key"
        description="Stored encrypted by OpenChart. The saved key is never shown again."
        className="flex-col items-start gap-y-2 sm:flex-row sm:items-center"
        classNameWrapperAction="w-full sm:w-auto"
        actions={
          <ProviderKeyControl
            transport={transport}
            providerID={providerID}
            disabled={settings.isSaving || !!settings.readError}
            onChanged={() => discovery.refetch()}
          />
        }
      />
    </div>
  );
}
