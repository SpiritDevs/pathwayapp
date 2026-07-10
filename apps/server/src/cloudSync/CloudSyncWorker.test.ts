import { EventId, ThreadId, type OrchestrationEvent } from "@pathwayos/contracts";
import { describe, expect, it } from "vite-plus/test";

import { cloudSyncBatchId, orchestrationEventThreadId } from "./CloudSyncWorker.ts";

describe("CloudSyncWorker", () => {
  it("uses deterministic sequence-bound batch identifiers", () => {
    expect(cloudSyncBatchId("environment-1", 10, 20)).toBe("environment-1:10:20");
  });

  it("finds thread ownership from thread aggregates and payloads", () => {
    const aggregateEvent: OrchestrationEvent = {
      sequence: 1,
      eventId: EventId.make("event-1"),
      type: "thread.archived",
      aggregateKind: "thread",
      aggregateId: ThreadId.make("thread-1"),
      occurredAt: "2026-07-10T00:00:00.000Z",
      commandId: null,
      causationEventId: null,
      correlationId: null,
      metadata: {},
      payload: {
        threadId: ThreadId.make("thread-1"),
        archivedAt: "2026-07-10T00:00:00.000Z",
        updatedAt: "2026-07-10T00:00:00.000Z",
      },
    };
    expect(orchestrationEventThreadId(aggregateEvent)).toBe("thread-1");
  });
});
