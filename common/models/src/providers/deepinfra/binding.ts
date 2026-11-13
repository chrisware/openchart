// Purpose: DeepInfra's hosted endpoint over the shared OpenAI-compatible HTTP binding.
import type { ApiProvider } from "@openchart/models/api-provider";
import { DEEPINFRA } from "@openchart/models/model-tiers";
import { createOpenAICompatibleProvider } from "@openchart/models/providers/http";

/** DeepInfra inference; endpoint and catalog key are fixed by the product. */
export const deepinfra: ApiProvider = createOpenAICompatibleProvider({
  id: DEEPINFRA,
  name: "DeepInfra",
  sdkKey: "openaiCompatible",
  defaultBaseURL: "https://api.deepinfra.com/v1/openai",
  catalogProvider: "deepinfra",
  apiKeyRequired: true,
});
