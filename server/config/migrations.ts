// Purpose: Drops saved settings for provider IDs that the product has retired.
import { Schema } from "effect";
import { DEEPINFRA, MODEL_TIER_IDS } from "@openchart/models/model-tiers";
import { RETIRED_MODEL_PROVIDER_IDS } from "@openchart/server/models/config";

type JsonObject = Record<string, Schema.Json>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Removes retired model providers and any default selection that pointed at
 * one. Unknown namespaces and unrelated fields are preserved. Idempotent.
 * @example const document = migrateSettings(rawSettings);
 */
export function migrateSettings(
  document: Schema.JsonObject,
): Schema.JsonObject {
  const models = document.models;
  if (!isObject(models)) return document;
  const next: JsonObject = { ...models };
  let changed = false;

  const providers = models.providers;
  if (isObject(providers)) {
    const kept: JsonObject = { ...providers };
    for (const id of RETIRED_MODEL_PROVIDER_IDS) {
      if (Object.hasOwn(kept, id)) {
        delete kept[id];
        changed = true;
      }
    }
    if (changed) next.providers = kept;
  }

  const defaultModel = models.defaultModel;
  if (isObject(defaultModel)) {
    // The old generic provider only ever served DeepInfra, so keep its explicit
    // model selection; logical tiers never applied to endpoint model IDs.
    if (defaultModel.providerID === "openai-compatible") {
      if (
        typeof defaultModel.modelID === "string" &&
        !MODEL_TIER_IDS.some((id) => id === defaultModel.modelID)
      )
        next.defaultModel = { ...defaultModel, providerID: DEEPINFRA };
      else delete next.defaultModel;
      changed = true;
    } else if (
      RETIRED_MODEL_PROVIDER_IDS.some((id) => id === defaultModel.providerID)
    ) {
      delete next.defaultModel;
      changed = true;
    }
  }

  return changed
    ? ({ ...document, models: next } as Schema.JsonObject)
    : document;
}
