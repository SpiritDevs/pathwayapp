import {
  Issue,
  IssueActor,
  IssueCommandResult,
  IssueCycle,
  IssueDetail,
  IssueEpic,
  IssueLabel,
  IssueMilestone,
  IssueRelation,
  IssueSavedView,
  IssueTeam,
  IssueTeamMembership,
  IssueThreadLink,
  IssueWorkflowState,
  type IssueCommand,
  type IssueCommandAttribution,
  type IssueId,
  type IssuesEntityRow,
} from "@pathwayos/contracts";
import { convexHttpActionsUrl } from "@pathwayos/shared/convexUrl";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import { RELAY_ENVIRONMENT_CREDENTIAL_SECRET } from "../cloud/config.ts";
import { convexUrlConfig } from "../cloud/publicConfig.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";

export class IssuesCommandClientError extends Schema.TaggedErrorClass<IssuesCommandClientError>()(
  "IssuesCommandClientError",
  {
    kind: Schema.Literals(["offline", "http"]),
    operation: Schema.Literals(["command", "mirror", "detail"]),
    message: Schema.String,
    status: Schema.optional(Schema.Number),
    cause: Schema.optional(Schema.Defect()),
  },
) {}

const withSyncSeq = <Fields extends Schema.Struct.Fields>(fields: Fields) =>
  Schema.Struct({ ...fields, syncSeq: Schema.Number });

const MirrorIssuePurgeDoc = Schema.Struct({
  id: Schema.String,
  purged: Schema.Literal(true),
  syncSeq: Schema.Number,
});

const MirrorDeltaWireRow = Schema.Union([
  Schema.Struct({ table: Schema.Literal("teams"), doc: withSyncSeq(IssueTeam.fields) }),
  Schema.Struct({
    table: Schema.Literal("memberships"),
    doc: withSyncSeq(IssueTeamMembership.fields),
  }),
  Schema.Struct({ table: Schema.Literal("states"), doc: withSyncSeq(IssueWorkflowState.fields) }),
  Schema.Struct({ table: Schema.Literal("labels"), doc: withSyncSeq(IssueLabel.fields) }),
  Schema.Struct({ table: Schema.Literal("actors"), doc: withSyncSeq(IssueActor.fields) }),
  Schema.Struct({ table: Schema.Literal("cycles"), doc: withSyncSeq(IssueCycle.fields) }),
  Schema.Struct({ table: Schema.Literal("epics"), doc: withSyncSeq(IssueEpic.fields) }),
  Schema.Struct({
    table: Schema.Literal("milestones"),
    doc: withSyncSeq(IssueMilestone.fields),
  }),
  Schema.Struct({
    table: Schema.Literal("issues"),
    doc: Schema.Union([withSyncSeq(Issue.fields), MirrorIssuePurgeDoc]),
  }),
  Schema.Struct({
    table: Schema.Literal("relations"),
    doc: Schema.Union([withSyncSeq(IssueRelation.fields), MirrorIssuePurgeDoc]),
  }),
  Schema.Struct({
    table: Schema.Literal("threadLinks"),
    doc: Schema.Union([withSyncSeq(IssueThreadLink.fields), MirrorIssuePurgeDoc]),
  }),
  Schema.Struct({
    table: Schema.Literal("savedViews"),
    doc: withSyncSeq(IssueSavedView.fields),
  }),
]);

const MirrorDeltaWireResponse = Schema.Struct({
  rows: Schema.Array(MirrorDeltaWireRow),
  nextSeq: Schema.Number,
  hasMore: Schema.Boolean,
  workspaceKey: Schema.String,
  viewerUserId: Schema.NullOr(Schema.String),
});
const IssuesHttpErrorEnvelope = Schema.Struct({ error: Schema.String });

export type IssuesMirrorDeltaRow =
  | { readonly seq: number; readonly entity: IssuesEntityRow }
  | {
      readonly seq: number;
      readonly purge: {
        readonly table: "issues" | "relations" | "threadLinks";
        readonly id: string;
      };
    };

export interface IssuesMirrorDelta {
  readonly rows: ReadonlyArray<IssuesMirrorDeltaRow>;
  readonly nextSeq: number;
  readonly hasMore: boolean;
  readonly workspaceKey: string;
  readonly viewerUserId: string | null;
}

export class IssuesCommandClient extends Context.Service<
  IssuesCommandClient,
  {
    readonly execute: (
      command: IssueCommand,
      attribution: IssueCommandAttribution,
    ) => Effect.Effect<IssueCommandResult, IssuesCommandClientError>;
    readonly mirrorDelta: (input: {
      readonly sinceSeq: number;
      readonly limit: number;
    }) => Effect.Effect<IssuesMirrorDelta, IssuesCommandClientError>;
    readonly getIssueDetail: (
      issueId: IssueId,
    ) => Effect.Effect<IssueDetail, IssuesCommandClientError>;
  }
>()("pathwayos/issues/IssuesCommandClient") {}

const make = Effect.gen(function* () {
  const httpClient = yield* HttpClient.HttpClient;
  const secrets = yield* ServerSecretStore.ServerSecretStore;
  const environment = yield* ServerEnvironment.ServerEnvironment;

  const readCredential = (operation: "command" | "mirror" | "detail") =>
    secrets.get(RELAY_ENVIRONMENT_CREDENTIAL_SECRET).pipe(
      Effect.map(Option.map((bytes) => new TextDecoder().decode(bytes).trim())),
      Effect.map(Option.filter((value) => value.length > 0)),
      Effect.mapError(
        (cause) =>
          new IssuesCommandClientError({
            kind: "offline",
            operation,
            message: "Could not read the cloud environment credential.",
            cause,
          }),
      ),
    );
  const readHttpActionsUrl = convexUrlConfig.pipe(
    Effect.map(convexHttpActionsUrl),
    Effect.map(Option.fromNullishOr),
    Effect.orElseSucceed(() => Option.none<string>()),
  );

  const post = <S extends Schema.Top>(
    operation: "command" | "mirror" | "detail",
    path: string,
    payload: unknown,
    responseSchema: S,
  ): Effect.Effect<S["Type"], IssuesCommandClientError, S["DecodingServices"]> =>
    Effect.gen(function* () {
      const [credential, actionsUrl] = yield* Effect.all([
        readCredential(operation),
        readHttpActionsUrl,
      ]);
      if (Option.isNone(credential) || Option.isNone(actionsUrl)) {
        return yield* new IssuesCommandClientError({
          kind: "offline",
          operation,
          message: "Issues synchronization is offline because the environment is not linked.",
        });
      }
      const response = yield* HttpClientRequest.post(`${actionsUrl.value}${path}`).pipe(
        HttpClientRequest.bearerToken(credential.value),
        HttpClientRequest.bodyJson(payload),
        Effect.flatMap(httpClient.execute),
        Effect.mapError(
          (cause) =>
            new IssuesCommandClientError({
              kind: "offline",
              operation,
              message: "The issues service could not be reached.",
              cause,
            }),
        ),
      );
      if (response.status < 200 || response.status >= 300) {
        const responseMessage = yield* HttpClientResponse.schemaBodyJson(IssuesHttpErrorEnvelope)(
          response,
        ).pipe(
          Effect.map(({ error }) => error),
          Effect.orElseSucceed(() => `The issues service returned HTTP ${response.status}.`),
        );
        return yield* new IssuesCommandClientError({
          kind: "http",
          operation,
          status: response.status,
          message: responseMessage,
        });
      }
      return yield* HttpClientResponse.schemaBodyJson(responseSchema)(response).pipe(
        Effect.mapError(
          (cause) =>
            new IssuesCommandClientError({
              kind: "http",
              operation,
              status: response.status,
              message: "The issues service returned an invalid response.",
              cause,
            }),
        ),
      );
    });

  const execute: IssuesCommandClient["Service"]["execute"] = (command, attribution) =>
    environment.getEnvironmentId.pipe(
      Effect.mapError(
        (cause) =>
          new IssuesCommandClientError({
            kind: "offline",
            operation: "command",
            message: "Could not resolve the local environment identity.",
            cause,
          }),
      ),
      Effect.flatMap((environmentId) =>
        post(
          "command",
          "/v1/issues/command",
          { environmentId, command, attribution },
          IssueCommandResult,
        ),
      ),
    );

  const mirrorDelta: IssuesCommandClient["Service"]["mirrorDelta"] = (input) =>
    environment.getEnvironmentId.pipe(
      Effect.mapError(
        (cause) =>
          new IssuesCommandClientError({
            kind: "offline",
            operation: "mirror",
            message: "Could not resolve the local environment identity.",
            cause,
          }),
      ),
      Effect.flatMap((environmentId) =>
        post("mirror", "/v1/issues/mirror", { environmentId, ...input }, MirrorDeltaWireResponse),
      ),
      Effect.map((response) => ({
        ...response,
        rows: response.rows.map((row): IssuesMirrorDeltaRow => {
          if (
            (row.table === "issues" || row.table === "relations" || row.table === "threadLinks") &&
            "purged" in row.doc
          ) {
            return { seq: row.doc.syncSeq, purge: { table: row.table, id: row.doc.id } };
          }
          const { syncSeq, ...entityRow } = row.doc;
          return {
            seq: syncSeq,
            entity: { table: row.table, row: entityRow } as IssuesEntityRow,
          };
        }),
      })),
    );

  const getIssueDetail: IssuesCommandClient["Service"]["getIssueDetail"] = (issueId) =>
    environment.getEnvironmentId.pipe(
      Effect.mapError(
        (cause) =>
          new IssuesCommandClientError({
            kind: "offline",
            operation: "detail",
            message: "Could not resolve the local environment identity.",
            cause,
          }),
      ),
      Effect.flatMap((environmentId) =>
        post("detail", "/v1/issues/detail", { environmentId, issueId }, IssueDetail),
      ),
    );

  return IssuesCommandClient.of({ execute, mirrorDelta, getIssueDetail });
});

export const layer = Layer.effect(IssuesCommandClient, make);
