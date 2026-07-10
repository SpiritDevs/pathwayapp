import { describe, expect, it } from "vite-plus/test";

import { EMAIL_SYNC_STATE_META, formatBytes, runtimePhaseLabel } from "./format";

describe("formatBytes", () => {
  it("formats each magnitude", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2_048)).toBe("2.0 KB");
    expect(formatBytes(10_485_760)).toBe("10.0 MB");
    expect(formatBytes(2_147_483_648)).toBe("2.0 GB");
  });
});

describe("runtimePhaseLabel", () => {
  it("labels known phases and falls back to disabled", () => {
    expect(runtimePhaseLabel("running")).toBe("Running");
    expect(runtimePhaseLabel("degraded")).toBe("Needs attention");
    expect(runtimePhaseLabel("something-else")).toBe("Disabled");
  });
});

describe("EMAIL_SYNC_STATE_META", () => {
  it("covers every sync state with a label", () => {
    for (const state of ["local", "pending", "synced", "failed", "deleted"] as const) {
      expect(EMAIL_SYNC_STATE_META[state].label.length).toBeGreaterThan(0);
      expect(EMAIL_SYNC_STATE_META[state].dotClass.startsWith("bg-")).toBe(true);
    }
  });
});
