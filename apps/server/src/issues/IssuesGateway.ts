import type {
  IssueCommand,
  IssueCommandAttribution,
  IssueCommandResult,
  IssueDetail,
  IssueDetailStreamItem,
  IssueId,
  IssuesDomainError,
  IssuesSnapshot,
  IssuesStreamItem,
} from "@pathwayos/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";

export class IssuesGateway extends Context.Service<
  IssuesGateway,
  {
    readonly execute: (
      command: IssueCommand,
      attribution: IssueCommandAttribution,
    ) => Effect.Effect<IssueCommandResult, IssuesDomainError>;
    readonly getSnapshot: Effect.Effect<IssuesSnapshot, IssuesDomainError>;
    readonly getIssueDetail: (
      issueId: IssueId,
    ) => Effect.Effect<IssueDetail, IssuesDomainError>;
    readonly changes: Stream.Stream<IssuesStreamItem>;
    readonly detailChanges: (issueId: IssueId) => Stream.Stream<IssueDetailStreamItem>;
  }
>()("pathwayos/issues/IssuesGateway") {}
