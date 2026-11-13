// Purpose: OpenCode Go's hosted endpoint over the shared OpenAI-compatible HTTP binding.
import type { ApiProvider } from "@openchart/models/api-provider";
import { OPENCODE_GO } from "@openchart/models/model-tiers";
import { createOpenAICompatibleProvider } from "@openchart/models/providers/http";

/** OpenCode Go subscription inference; endpoint and catalog key are fixed by the product. */
export const openCodeGo: ApiProvider = createOpenAICompatibleProvider({
  id: OPENCODE_GO,
  name: "OpenCode Go",
  sdkKey: "openaiCompatible",
  defaultBaseURL: "https://opencode.ai/inference/go/openai/v1",
  catalogProvider: "opencode-go",
  apiKeyRequired: true,
});
