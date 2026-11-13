// Purpose: Proves the generic provider rename moves its saved key and agent-prompt targets to DeepInfra.

import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { DatabaseMigration } from "@openchart/server/db/migration";
import { migrations } from "@openchart/server/db/migration.gen";
import { sql } from "drizzle-orm";
import { makeWithDefaults } from "drizzle-orm/effect-sqlite-node";
import { Effect } from "effect";
import { expect, test } from "vitest";

test("renames stored generic-provider keys and prompt targets to DeepInfra", () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const index = migrations.findIndex((migration) =>
        migration.id.endsWith("_renamed-deepinfra-provider"),
      );
      expect(index).toBeGreaterThan(0);
      const db = yield* makeWithDefaults();
      yield* DatabaseMigration.applyOnly(db, migrations.slice(0, index));

      const target = (providerID: string) =>
        JSON.stringify({
          kind: "agent_prompt",
          prompt: {
            agent: "analyst",
            model: { providerID, modelID: "deepseek-ai/DeepSeek-V4.1-Flash" },
            parts: [{ type: "text", text: "Review the alert." }],
          },
        });
      for (const [id, providerID] of [
        ["trg_generic", "openai-compatible"],
        ["trg_current", "deepinfra"],
      ] as const) {
        yield* db.run(sql`
          INSERT INTO trigger
            (id, revision, created_at, updated_at, name, enabled, event_json, target_json)
          VALUES (${id}, 1, 50, 60, 'Existing action', 1,
            '{"kind":"alert","ruleId":"alr_old"}', ${target(providerID)})
        `);
        yield* db.run(sql`
          INSERT INTO agent_schedule
            (id, revision, created_at, updated_at, name, enabled, target_json,
              recurrence, next_fire_at)
          VALUES (${`sch_${id}`}, 1, 50, 60, 'Existing schedule', 1,
            ${target(providerID)}, '{"kind":"once","fireAt":"2026-11-14T00:00:00Z"}', 100)
        `);
      }
      yield* db.run(sql`
        INSERT INTO credential
          (id, integration_id, label, value, active, time_created, time_updated)
        VALUES ('cred_generic', 'openai-compatible', 'default', 'ciphertext', 1, 50, 60)
      `);

      yield* DatabaseMigration.apply(db);

      expect(
        yield* db.all<{ integration_id: string }>(
          sql`SELECT integration_id FROM credential`,
        ),
      ).toEqual([{ integration_id: "deepinfra" }]);
      const providerOf = (row: { target_json: string }) =>
        JSON.parse(row.target_json).prompt.model.providerID;
      expect(
        (yield* db.all<{ target_json: string }>(
          sql`SELECT target_json FROM trigger ORDER BY id`,
        )).map(providerOf),
      ).toEqual(["deepinfra", "deepinfra"]);
      expect(
        (yield* db.all<{ target_json: string }>(
          sql`SELECT target_json FROM agent_schedule ORDER BY id`,
        )).map(providerOf),
      ).toEqual(["deepinfra", "deepinfra"]);
    }).pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:" }))),
  ));
