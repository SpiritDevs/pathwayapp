import { describe, expect, it } from "vite-plus/test";

import {
  consumePendingInvitation,
  invitationAcceptPath,
  rememberPendingInvitation,
} from "./invitationRouting";

function memoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => {
      entries.delete(key);
    },
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
}

describe("invitation routing", () => {
  it("encodes invitation tokens in the acceptance path", () => {
    expect(invitationAcceptPath("secret/+ value")).toBe(
      "/invitations/accept?token=secret%2F%2B%20value",
    );
  });

  it("keeps the invitation for exactly one post-sign-in navigation", () => {
    const storage = memoryStorage();
    rememberPendingInvitation("secret", storage);
    expect(consumePendingInvitation(storage)).toBe("/invitations/accept?token=secret");
    expect(consumePendingInvitation(storage)).toBeNull();
  });
});
