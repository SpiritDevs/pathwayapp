import type {
  IssueCommand,
  IssueCommandAttribution,
  IssueCycleConfig,
  StateCategory,
} from "@pathwayos/contracts";
import { orderKeyBetween } from "@pathwayos/shared/fractionalIndex";
import * as DateTime from "effect/DateTime";

export const DEFAULT_WORKSPACE_KEY = "WS";

export const DEFAULT_CYCLE_CONFIG: IssueCycleConfig = {
  enabled: false,
  startDayOfWeek: 1,
  durationWeeks: 2,
  cooldownWeeks: 0,
  autoRollover: true,
};

export const DEFAULT_STATES: ReadonlyArray<{
  readonly name: string;
  readonly color: string;
  readonly category: StateCategory;
  readonly position: number;
}> = [
  { name: "Triage", color: "#8B5CF6", category: "triage", position: 0 },
  { name: "Backlog", color: "#6B7280", category: "backlog", position: 1 },
  { name: "Todo", color: "#9CA3AF", category: "unstarted", position: 2 },
  { name: "In Progress", color: "#F59E0B", category: "started", position: 3 },
  { name: "In Review", color: "#3B82F6", category: "started", position: 4 },
  { name: "Done", color: "#10B981", category: "completed", position: 5 },
  { name: "Canceled", color: "#EF4444", category: "canceled", position: 6 },
  { name: "Duplicate", color: "#F97316", category: "canceled", position: 7 },
];

export function normalizeIssueKey(value: string): string {
  const key = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{0,5}$/u.test(key)) throw new Error("ISSUES_KEY_INVALID");
  return key;
}

export function formatIssueIdentifier(key: string, number: number): string {
  if (!Number.isSafeInteger(number) || number < 1) throw new Error("ISSUES_NUMBER_INVALID");
  return `${normalizeIssueKey(key)}-${number}`;
}

export function nextIssueOrderKey(currentKeys: ReadonlyArray<string>): string {
  const maximum = currentKeys.reduce<string | null>(
    (current, key) => (current === null || key > current ? key : current),
    null,
  );
  return orderKeyBetween(maximum, null);
}

export function assertIssueCommandGuardrails(
  command: IssueCommand,
  attribution: IssueCommandAttribution,
): void {
  if (attribution.kind === "agent" && command.type === "issue.purge") {
    throw new Error("ISSUES_FORBIDDEN_AGENT_PURGE");
  }
}

/** Removes free-form content and local-only agent configuration from durable audit payloads. */
export function sanitizedIssueCommandPayload(command: IssueCommand): Record<string, unknown> {
  const source = command as unknown as Readonly<Record<string, unknown>>;
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === "descriptionMd" || key === "bodyMd" || key === "config") continue;
    if (key === "patch" && typeof value === "object" && value !== null && !Array.isArray(value)) {
      const patch: Record<string, unknown> = {};
      for (const [patchKey, patchValue] of Object.entries(value)) {
        if (patchKey !== "descriptionMd" && patchKey !== "config") patch[patchKey] = patchValue;
      }
      payload.patch = patch;
      continue;
    }
    payload[key] = value;
  }
  return payload;
}

const DAY_MS = 24 * 60 * 60 * 1_000;
const WEEK_MS = 7 * DAY_MS;

export interface MaterializedCycleWindow {
  readonly number: number;
  readonly startsAt: string;
  readonly endsAt: string;
}

/** UTC cycle math, anchored to the first configured weekday on/after Unix epoch. */
export function cycleWindows(
  config: IssueCycleConfig,
  nowMs: number,
): readonly [MaterializedCycleWindow, MaterializedCycleWindow] {
  if (!config.enabled) throw new Error("ISSUES_CYCLES_DISABLED");
  if (
    !Number.isSafeInteger(config.durationWeeks) ||
    config.durationWeeks < 1 ||
    !Number.isSafeInteger(config.cooldownWeeks) ||
    config.cooldownWeeks < 0
  ) {
    throw new Error("ISSUES_CYCLE_CONFIG_INVALID");
  }
  const epochDay = 4;
  const anchorMs = ((config.startDayOfWeek - epochDay + 7) % 7) * DAY_MS;
  const periodMs = (config.durationWeeks + config.cooldownWeeks) * WEEK_MS;
  const index = Math.max(0, Math.floor((nowMs - anchorMs) / periodMs));
  const makeWindow = (cycleIndex: number): MaterializedCycleWindow => {
    const startsMs = anchorMs + cycleIndex * periodMs;
    return {
      number: cycleIndex + 1,
      startsAt: DateTime.formatIso(DateTime.makeUnsafe(startsMs)),
      endsAt: DateTime.formatIso(DateTime.makeUnsafe(startsMs + config.durationWeeks * WEEK_MS)),
    };
  };
  return [makeWindow(index), makeWindow(index + 1)];
}

export function isIncompleteStateCategory(category: StateCategory): boolean {
  return category !== "completed" && category !== "canceled";
}
