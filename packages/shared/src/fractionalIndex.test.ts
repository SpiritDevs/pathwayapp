import { describe, expect, it } from "vite-plus/test";

import { orderKeyBetween, orderKeyInitial, orderKeysForCount } from "./fractionalIndex.js";

describe("fractionalIndex", () => {
  it("creates a stable initial key and keys at both open ends", () => {
    const initial = orderKeyInitial();
    const before = orderKeyBetween(null, initial);
    const after = orderKeyBetween(initial, null);

    expect(before < initial).toBe(true);
    expect(after > initial).toBe(true);
    expect(orderKeyBetween(null, null)).toBe(initial);
  });

  it("creates a key strictly between two keys", () => {
    const between = orderKeyBetween("A", "z");

    expect(between > "A").toBe(true);
    expect(between < "z").toBe(true);
  });

  it("handles adjacent base-62 digits by extending the lower key", () => {
    const between = orderKeyBetween("a", "b");

    expect(between > "a").toBe(true);
    expect(between < "b").toBe(true);
  });

  it("generates deterministic, sorted rebalance keys", () => {
    const keys = orderKeysForCount(5);

    expect(keys).toHaveLength(5);
    expect(keys).toEqual([...keys].sort());
    expect(orderKeysForCount(5)).toEqual(keys);
  });
});
