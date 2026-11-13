// Purpose: Declares native provider activation, permission preference, and default selection.
import {
  ANTIGRAVITY,
  CLAUDE_CODE,
  CODEX,
  GROK,
  DEEPINFRA,
  MODEL_PROVIDER_IDS,
  OPENCODE_GO,
} from "@openchart/models/model-tiers";
import { PROVIDER_PERMISSION_MODES } from "@openchart/models/provider-permission";
import { Config, Effect, Schema } from "effect";
import { AgentPromptModel } from "@openchart/server/agent/contracts/agent-prompt-input";

/** Provider IDs removed from the product; config reads drop their saved fields. */
export const RETIRED_MODEL_PROVIDER_IDS = ["omp", "openai-compatible"] as const;

/** Native provider IDs accepted by setup actions and configuration. */
export const NativeProviderID = Schema.Literals(MODEL_PROVIDER_IDS);

const EnabledProviderSettings = Schema.Struct({
  enabled: Schema.Boolean.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(true)),
  ),
});

/** Public model configuration; native agents keep their own authentication. */
export const ModelsSettings = Schema.Struct({
  /** Cross-provider policy captured at the start of each native request. */
  permissionMode: Schema.Literals(PROVIDER_PERMISSION_MODES).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed("full-access")),
  ),
  providers: Schema.Struct({
    [CODEX]: EnabledProviderSettings.pipe(
      Schema.withDecodingDefaultKey(Effect.succeed({})),
    ),
    [CLAUDE_CODE]: EnabledProviderSettings.pipe(
      Schema.withDecodingDefaultKey(Effect.succeed({})),
    ),
    [ANTIGRAVITY]: EnabledProviderSettings.pipe(
      Schema.withDecodingDefaultKey(Effect.succeed({})),
    ),
    [GROK]: EnabledProviderSettings.pipe(
      Schema.withDecodingDefaultKey(Effect.succeed({})),
    ),
    [DEEPINFRA]: EnabledProviderSettings.pipe(
      Schema.withDecodingDefaultKey(Effect.succeed({})),
    ),
    [OPENCODE_GO]: EnabledProviderSettings.pipe(
      Schema.withDecodingDefaultKey(Effect.succeed({})),
    ),
  }).pipe(Schema.withDecodingDefaultKey(Effect.succeed({}))),
  defaultModel: Schema.optionalKey(AgentPromptModel),
});

/** Reads the domain schema from the current native ConfigProvider. */
export const config = Config.schema(
  Schema.Struct({
    models: ModelsSettings.pipe(
      Schema.withDecodingDefaultKey(Effect.succeed({})),
    ),
  }),
).pipe(Config.map((value) => value.models));
