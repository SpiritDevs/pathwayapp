import type { DelegationQueueState, IssuesDomainError } from "@pathwayos/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

export class IssueDelegationService extends Context.Service<
  IssueDelegationService,
  {
    readonly start: () => Effect.Effect<void, never, Scope.Scope>;
    readonly state: Effect.Effect<DelegationQueueState, IssuesDomainError>;
  }
>()("pathwayos/issues/delegation/IssueDelegationService") {}
