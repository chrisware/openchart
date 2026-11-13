// Purpose: Shared OpenAI-compatible HTTP discovery and standard AI SDK model access.
import type { ProviderV4 } from "@ai-sdk/provider";
import type { ApiProvider } from "@openchart/models/api-provider";
import type { ModelsDev } from "@openchart/models/catalog";
import type { ApiProviderID } from "@openchart/models/model-tiers";
import type {
  AvailableModel,
  ModelProvider,
} from "@openchart/models/model-provider";
import {
  catalogModelMetadata,
  resolveCatalogProvider,
} from "@openchart/models/providers/model-catalog";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";

const DISCOVERY_TIMEOUT_MS = 15_000;

function validBaseURL(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Host configuration for the API provider. `apiKey` is reserved for hosts that
 * resolve a key themselves; it is never part of the config schema.
 */
const ProviderSettings = z.looseObject({
  baseURL: z.string().optional(),
  catalogProvider: z.string().optional(),
  apiKey: z.string().optional(),
});

const ModelList = z.object({
  data: z.array(z.object({ id: z.string(), name: z.string().optional() })),
});

/**
 * Projects one OpenAI `/models` row. The models.dev catalog enriches known
 * identities; unknown endpoints keep unknown capabilities instead of guessing.
 */
function enrichModel(
  providerID: ApiProviderID,
  row: { id: string; name?: string },
  metadata: ModelsDev.Model | undefined,
): AvailableModel {
  const enriched = catalogModelMetadata(metadata);
  return {
    kind: "language",
    providerID,
    id: row.id,
    name: metadata?.name ?? row.name ?? row.id,
    capabilities: {
      ...enriched.capabilities,
      input: { text: true, ...enriched.capabilities.input },
      output: { text: true, ...enriched.capabilities.output },
    },
    ...(enriched.cost ? { cost: enriched.cost } : {}),
    ...(enriched.limit ? { limit: enriched.limit } : {}),
  };
}

async function listModels(
  baseURL: string,
  apiKey: string | undefined,
): Promise<Array<{ id: string; name?: string }>> {
  const url = `${baseURL.replace(/\/+$/, "")}/models`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "OpenChart/V2",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
  });
  if (!response.ok)
    throw new Error(
      `OpenAI-compatible model list failed (HTTP ${response.status}).`,
    );
  const parsed = ModelList.parse(await response.json());
  const seen = new Set<string>();
  return parsed.data.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

/** Fixed product defaults for one hosted OpenAI-compatible endpoint. */
export interface OpenAICompatibleProviderOptions {
  readonly id: ApiProviderID;
  /** Product name shown in discovery and model pickers. */
  readonly name: string;
  /** AI SDK `providerOptions` namespace. */
  readonly sdkKey: string;
  /** Endpoint used when the host configuration leaves `baseURL` unset. */
  readonly defaultBaseURL?: string;
  /** models.dev provider used when the host configuration leaves it unset. */
  readonly catalogProvider?: string;
  /** Discovery requires a stored key before contacting the endpoint. */
  readonly apiKeyRequired?: boolean;
}

/**
 * Creates a lazy HTTP binding factory. Construction performs no I/O; discovery
 * reads the configured `/models` endpoint and the models.dev catalog. Requests
 * use the standard AI SDK, so OpenChart executes host tools itself.
 */
export function createOpenAICompatibleProvider(
  options: OpenAICompatibleProviderOptions,
): ApiProvider {
  function createModelProvider(
    catalog: ModelsDev.Catalog,
    providerSettings?: Readonly<Record<string, unknown>>,
  ): ModelProvider {
    const settings = ProviderSettings.parse({
      ...(options.defaultBaseURL
        ? { baseURL: options.defaultBaseURL }
        : undefined),
      ...(options.catalogProvider
        ? { catalogProvider: options.catalogProvider }
        : undefined),
      ...providerSettings,
    });
    const baseURL = settings.baseURL ?? "";
    const catalogProvider = settings.catalogProvider ?? "";
    let disposed = false;
    let sdk: ProviderV4 | undefined;

    function apiKey() {
      return settings.apiKey;
    }

    function getSDK() {
      if (disposed) throw new Error("OpenAI-compatible binding is disposed");
      if (!baseURL) throw new Error("OpenAI-compatible base URL is not set");
      const key = apiKey();
      return (sdk ??= createOpenAICompatible({
        name: options.id,
        baseURL,
        ...(key ? { apiKey: key } : {}),
        includeUsage: true,
      }));
    }

    return {
      id: options.id,
      get sdk() {
        return getSDK();
      },
      async discover() {
        if (disposed) throw new Error("OpenAI-compatible binding is disposed");
        if (!baseURL)
          return {
            status: "configuration_required",
            message: "Set an OpenAI-compatible base URL.",
          } as const;
        if (!validBaseURL(baseURL))
          return {
            status: "configuration_required",
            message: "Set a valid http(s) OpenAI-compatible base URL.",
          } as const;
        const key = apiKey();
        if (options.apiKeyRequired && !key)
          return {
            status: "configuration_required",
            message: `Set the ${options.name} API key.`,
          } as const;
        const [rows, catalogProviders] = await Promise.all([
          listModels(baseURL, key),
          catalog.get(),
        ]);
        if (disposed) throw new Error("OpenAI-compatible binding is disposed");
        const providerKey = resolveCatalogProvider(
          catalogProviders,
          baseURL,
          rows.map((row) => row.id),
          catalogProvider,
        );
        const metadata = providerKey
          ? catalogProviders[providerKey]?.models
          : undefined;
        return {
          status: "ready",
          provider: {
            id: options.id,
            name: options.name,
            models: rows.map((row) =>
              enrichModel(options.id, row, metadata?.[row.id]),
            ),
          },
        };
      },
      async readQuota() {
        return { status: "not_applicable" };
      },
      async dispose() {
        disposed = true;
      },
    };
  }

  return { id: options.id, sdkKey: options.sdkKey, createModelProvider };
}
