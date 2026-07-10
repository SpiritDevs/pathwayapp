import { normalizeSecureOrigin } from "./secureOrigin.ts";

export function normalizeSecureRelayUrl(value: string): string | null {
  return normalizeSecureOrigin(value);
}

export function isSecureRelayUrl(value: string): boolean {
  return normalizeSecureRelayUrl(value) !== null;
}
