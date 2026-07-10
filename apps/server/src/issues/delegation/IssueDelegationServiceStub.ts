import { IssuesDomainError } from "@pathwayos/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ServerSettings from "../../serverSettings.ts";
import { IssueDelegationService } from "./IssueDelegationService.ts";

export const IssueDelegationServiceUnavailableLive = Layer.effect(
  IssueDelegationService,
  Effect.gen(function* () {
    const settings = yield* ServerSettings.ServerSettingsService;
    return IssueDelegationService.of({
      start: () => Effect.void,
      state: settings.getSettings.pipe(
        Effect.map((current) => ({
          running: [],
          queued: [],
          capacity: {
            maxConcurrent: current.issueDelegation.maxConcurrent,
            cpuPercent: null,
            freeMemoryMb: null,
            headroomOk: false,
          },
        })),
        Effect.mapError(
          () =>
            new IssuesDomainError({
              code: "invalid",
              message: "Could not read issue delegation settings.",
            }),
        ),
      ),
    });
  }),
);
