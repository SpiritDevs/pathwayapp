import { describe, it, assert } from "@effect/vitest";
import {
  DEFAULT_SERVER_SETTINGS,
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderInstanceConfig,
  type ServerSettings,
} from "@pathwayos/contracts";

import { deriveProviderInstanceConfigMap } from "./ProviderInstanceRegistryHydration.ts";

describe("deriveProviderInstanceConfigMap", () => {
  it("only synthesizes Codex and Claude default provider instances", () => {
    const map = deriveProviderInstanceConfigMap(DEFAULT_SERVER_SETTINGS);

    assert.deepStrictEqual(Object.keys(map).sort(), ["claudeAgent", "codex"]);
    assert.strictEqual(map[ProviderInstanceId.make("codex")]?.driver, "codex");
    assert.strictEqual(map[ProviderInstanceId.make("claudeAgent")]?.driver, "claudeAgent");
  });

  it("keeps explicitly added Grok and OpenCode provider instances", () => {
    const grokInstanceId = ProviderInstanceId.make("grok_work");
    const opencodeInstanceId = ProviderInstanceId.make("opencode_local");
    const settings: ServerSettings = {
      ...DEFAULT_SERVER_SETTINGS,
      providerInstances: {
        [grokInstanceId]: {
          driver: ProviderDriverKind.make("grok"),
          enabled: true,
          config: {},
        } satisfies ProviderInstanceConfig,
        [opencodeInstanceId]: {
          driver: ProviderDriverKind.make("opencode"),
          enabled: true,
          config: {},
        } satisfies ProviderInstanceConfig,
      },
    };

    const map = deriveProviderInstanceConfigMap(settings);

    assert.deepStrictEqual(Object.keys(map).sort(), [
      "claudeAgent",
      "codex",
      "grok_work",
      "opencode_local",
    ]);
    assert.strictEqual(map[grokInstanceId]?.driver, "grok");
    assert.strictEqual(map[opencodeInstanceId]?.driver, "opencode");
  });
});
