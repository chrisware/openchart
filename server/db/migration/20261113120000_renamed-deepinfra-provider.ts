// Purpose: Renames the retired generic OpenAI-compatible provider to its sole historical endpoint, DeepInfra.

import type { DatabaseMigration } from "@openchart/server/db/migration";
import { sql } from "drizzle-orm";
import { Effect } from "effect";

const OLD_PROVIDER = "openai-compatible";
const NEW_PROVIDER = "deepinfra";

const migration: DatabaseMigration.Migration = {
  id: "20261113120000_renamed-deepinfra-provider",
  /**
   * Moves the saved API key and every agent-prompt target from the removed
   * generic provider to DeepInfra inside the runner-owned transaction.
   *
   * @example
   * ```ts
   * yield* migration.up(transaction);
   * ```
   */
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(sql`
        UPDATE credential
        SET integration_id = ${NEW_PROVIDER}
        WHERE integration_id = ${OLD_PROVIDER}
      `);
      yield* tx.run(sql`
        UPDATE trigger
        SET target_json = json_set(
          target_json,
          '$.prompt.model.providerID',
          ${NEW_PROVIDER}
        )
        WHERE json_extract(target_json, '$.prompt.model.providerID')
          = ${OLD_PROVIDER}
      `);
      yield* tx.run(sql`
        UPDATE agent_schedule
        SET target_json = json_set(
          target_json,
          '$.prompt.model.providerID',
          ${NEW_PROVIDER}
        )
        WHERE json_extract(target_json, '$.prompt.model.providerID')
          = ${OLD_PROVIDER}
      `);
    });
  },
};

export default migration;
