import { ThreadId } from "@pathwayos/contracts";
import { it } from "@effect/vitest";
import { expect } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { CloudSyncState, layer } from "./CloudSyncState.ts";

it.layer(layer.pipe(Layer.provideMerge(SqlitePersistenceMemory)))("CloudSyncState", (it) => {
  it.effect("creates one immutable fresh-start cutover and preserves local-only threads", () =>
    Effect.gen(function* () {
      const state = yield* CloudSyncState;
      const legacyThread = ThreadId.make("thread-legacy");
      const initialized = yield* state.initializeFreshCutover(17, [legacyThread]);
      expect(initialized.cutoverSequence).toBe(17);
      expect(initialized.acknowledgedSequence).toBe(17);
      expect(yield* state.isLocalOnlyThread(legacyThread)).toBe(true);

      const repeated = yield* state.initializeFreshCutover(99, []);
      expect(repeated.cutoverSequence).toBe(17);
    }),
  );

  it.effect("advances acknowledgements monotonically and records failures", () =>
    Effect.gen(function* () {
      const state = yield* CloudSyncState;
      yield* state.initializeFreshCutover(5, []);
      expect((yield* state.acknowledge(19)).acknowledgedSequence).toBe(19);
      expect((yield* state.acknowledge(18)).acknowledgedSequence).toBe(19);
      expect((yield* state.recordFailure("offline")).lastError).toBe("offline");
      expect((yield* state.acknowledge(20)).lastError).toBeNull();
    }),
  );
});
