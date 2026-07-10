import {
  type EmailAttachmentId,
  EmailMessageId,
  type EmailMessageDetail,
  type EmailMessageListInput,
  type EmailMessageListResult,
  EmailSandboxError,
  type EmailSandboxProjectSource,
  type EmailSandboxRuntimeStatus,
  type EmailSandboxSetProjectCaptureInput,
  type ProjectId,
} from "@pathwayos/contracts";
import * as Net from "@pathwayos/shared/Net";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import * as ServerConfig from "../config.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as OrchestrationEngine from "../orchestration/Services/OrchestrationEngine.ts";
import * as EmailSandboxStore from "./EmailSandboxStore.ts";
import * as MailpitRuntime from "./MailpitRuntime.ts";
import * as ProjectSmtpRouter from "./ProjectSmtpRouter.ts";

interface RuntimePorts {
  readonly smtpPort: number;
  readonly apiPort: number;
}

export interface EmailSandboxCoordinatorShape {
  readonly status: Effect.Effect<EmailSandboxRuntimeStatus, EmailSandboxError>;
  readonly reconcile: Effect.Effect<EmailSandboxRuntimeStatus, EmailSandboxError>;
  readonly listProjectSources: (
    projectId?: ProjectId,
  ) => Effect.Effect<ReadonlyArray<EmailSandboxProjectSource>, EmailSandboxError>;
  readonly setProjectCapture: (
    input: EmailSandboxSetProjectCaptureInput,
  ) => Effect.Effect<EmailSandboxProjectSource, EmailSandboxError>;
  readonly clearLocalCache: (projectId?: ProjectId) => Effect.Effect<
    {
      readonly clearedMessages: number;
      readonly retainedUnsyncedMessages: number;
      readonly reclaimedBytes: number;
    },
    EmailSandboxError
  >;
  readonly listMessages: (
    input: EmailMessageListInput,
  ) => Effect.Effect<EmailMessageListResult, EmailSandboxError>;
  readonly getMessage: (
    messageId: EmailMessageId,
  ) => Effect.Effect<EmailMessageDetail, EmailSandboxError>;
  readonly markRead: (
    messageId: EmailMessageId,
    read: boolean,
  ) => Effect.Effect<EmailMessageDetail, EmailSandboxError>;
  readonly deleteMessage: (
    messageId: EmailMessageId,
  ) => Effect.Effect<{ readonly deleted: boolean }, EmailSandboxError>;
  readonly getAttachment: (
    attachmentId: EmailAttachmentId,
  ) => Effect.Effect<EmailSandboxStore.EmailAttachmentContent | null, EmailSandboxError>;
  readonly appendAgentAudit: (
    record: EmailSandboxStore.EmailAgentAuditRecord,
  ) => Effect.Effect<void, EmailSandboxError>;
}

export class EmailSandboxCoordinator extends Context.Service<
  EmailSandboxCoordinator,
  EmailSandboxCoordinatorShape
>()("pathwayos/emailSandbox/EmailSandboxCoordinator") {}

const localLimitBytes = EmailSandboxStore.EMAIL_SANDBOX_LOCAL_LIMIT_BYTES;
const isEmailSandboxError = Schema.is(EmailSandboxError);

const sandboxError = (
  operation: EmailSandboxError["operation"],
  reason: EmailSandboxError["reason"],
  cause: unknown,
) =>
  new EmailSandboxError({
    operation,
    reason,
    message: cause instanceof Error ? cause.message : String(cause),
  });

const mapRuntimeStatus = (
  runtime: MailpitRuntime.MailpitRuntimeStatus,
  input: {
    readonly enabled: boolean;
    readonly activeProjectCount: number;
    readonly pendingMessageCount: number;
    readonly localBytes: number;
    readonly updatedAt: string;
  },
): EmailSandboxRuntimeStatus => {
  const common = {
    enabled: input.enabled,
    activeProjectCount: input.activeProjectCount,
    pendingMessageCount: input.pendingMessageCount,
    localBytes: input.localBytes,
    localByteLimit: localLimitBytes,
    updatedAt: input.updatedAt,
  } as const;
  switch (runtime.status) {
    case "disabled":
      return {
        ...common,
        phase: "disabled",
        mailpitVersion: null,
        pid: null,
        lastError: null,
      };
    case "failed":
      return {
        ...common,
        phase: "failed",
        mailpitVersion: null,
        pid: null,
        lastError: runtime.reason,
      };
    case "running":
      return {
        ...common,
        phase: "running",
        mailpitVersion: runtime.version,
        pid: runtime.pid,
        lastError: null,
      };
  }
};

export const make = Effect.gen(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const net = yield* Net.NetService;
  const runtime = yield* MailpitRuntime.MailpitRuntime;
  const settings = yield* ServerSettings.ServerSettingsService;
  const environment = yield* ServerEnvironment.ServerEnvironment;
  const store = yield* EmailSandboxStore.EmailSandboxStore;
  const router = yield* ProjectSmtpRouter.ProjectSmtpRouter;
  const orchestrationEngine = yield* OrchestrationEngine.OrchestrationEngineService;
  const environmentId = yield* environment.getEnvironmentId;
  const portsRef = yield* Ref.make<RuntimePorts | null>(null);

  const allocatePorts = Effect.fn("EmailSandboxCoordinator.allocatePorts")(
    function* () {
      const existing = yield* Ref.get(portsRef);
      if (existing) return existing;
      const smtpPort = yield* net.findAvailablePort(1025);
      let apiPort = yield* net.findAvailablePort(8025);
      if (apiPort === smtpPort) apiPort = yield* net.reserveLoopbackPort();
      const allocated = { smtpPort, apiPort } satisfies RuntimePorts;
      yield* Ref.set(portsRef, allocated);
      return allocated;
    },
    Effect.mapError((cause) => sandboxError("start", "port-conflict", cause)),
  );

  const readSettings = settings.getSettings.pipe(
    Effect.mapError((cause) => sandboxError("status", "persistence-failed", cause)),
  );

  const currentStatus: EmailSandboxCoordinatorShape["status"] = Effect.gen(function* () {
    const [serverSettings, runtimeStatus, counts] = yield* Effect.all([
      readSettings,
      runtime.status,
      store.counts,
    ]);
    return mapRuntimeStatus(runtimeStatus, {
      enabled: serverSettings.enableDeveloperEmailServer,
      activeProjectCount: counts.activeProjectCount,
      pendingMessageCount: counts.pendingMessageCount,
      localBytes: counts.localBytes,
      updatedAt: DateTime.formatIso(DateTime.nowUnsafe()),
    });
  });

  const listProjectSources: EmailSandboxCoordinatorShape["listProjectSources"] = (projectId) =>
    store.listSources(environmentId, projectId);

  const saveSourceState = (
    source: EmailSandboxProjectSource,
    patch: Partial<EmailSandboxProjectSource>,
  ) =>
    store.saveSource({
      ...source,
      ...patch,
      updatedAt: DateTime.formatIso(DateTime.nowUnsafe()),
    });

  const startSource = Effect.fn("EmailSandboxCoordinator.startSource")(
    function* (source: EmailSandboxProjectSource, mailpitSmtpPort: number) {
      let smtpPort = source.smtpPort;
      let portChanged = source.portChanged;
      if (smtpPort === null) {
        smtpPort = yield* net.findAvailablePort(11_025);
      }
      let starting = yield* saveSourceState(source, {
        smtpPort,
        status: "starting",
        lastError: null,
      });
      const firstAttempt = yield* router
        .start(starting, smtpPort, mailpitSmtpPort)
        .pipe(Effect.result);
      if (firstAttempt._tag === "Failure") {
        const fallbackPort = yield* net.findAvailablePort(Math.min(smtpPort + 1, 65_535));
        if (fallbackPort === smtpPort) return yield* firstAttempt.failure;
        portChanged = true;
        smtpPort = fallbackPort;
        starting = yield* saveSourceState(starting, { smtpPort, portChanged, status: "starting" });
        yield* router.start(starting, smtpPort, mailpitSmtpPort);
      }
      return yield* saveSourceState(starting, {
        smtpPort,
        portChanged,
        status: "running",
        lastError: null,
      });
    },
    Effect.mapError((cause) =>
      isEmailSandboxError(cause)
        ? cause
        : sandboxError("configure-project", "port-conflict", cause),
    ),
  );

  const reconcileEffect = Effect.fn("EmailSandboxCoordinator.reconcile")(
    function* () {
      const serverSettings = yield* readSettings;
      const sources = yield* listProjectSources();
      if (!serverSettings.enableDeveloperEmailServer) {
        yield* router.stopAll;
        yield* runtime.applyConfig(null);
        yield* Effect.forEach(sources, (source) =>
          source.status === "disabled"
            ? Effect.void
            : saveSourceState(source, { status: "disabled", lastError: null }).pipe(Effect.asVoid),
        );
        return yield* currentStatus;
      }
      const ports = yield* allocatePorts();
      const runtimeStatus = yield* runtime.applyConfig({
        databasePath: config.mailpitDatabasePath,
        smtpPort: ports.smtpPort,
        apiPort: ports.apiPort,
        maxMessageSizeMb: 25,
        label: "pathwayOS",
      });
      if (runtimeStatus.status !== "running") {
        yield* router.stopAll;
        return yield* currentStatus;
      }
      for (const source of sources) {
        if (!source.captureEnabled) {
          yield* router.stop(source.sourceId);
          if (source.status !== "disabled") {
            yield* saveSourceState(source, { status: "disabled", lastError: null });
          }
          continue;
        }
        const started = yield* startSource(source, runtimeStatus.smtpPort).pipe(Effect.result);
        if (started._tag === "Failure") {
          yield* saveSourceState(source, {
            status: "failed",
            lastError: started.failure.message,
          });
        }
      }
      return yield* currentStatus;
    },
    Effect.mapError((cause) =>
      isEmailSandboxError(cause) ? cause : sandboxError("start", "internal-error", cause),
    ),
  );
  const reconcile: EmailSandboxCoordinatorShape["reconcile"] = reconcileEffect();

  const setProjectCapture: EmailSandboxCoordinatorShape["setProjectCapture"] = Effect.fn(
    "EmailSandboxCoordinator.setProjectCapture",
  )(function* (input) {
    const existing = yield* store.getSource(environmentId, input.projectId);
    const serverSettings = yield* readSettings;
    const identifiers = EmailSandboxStore.localSourceIdentifiers(environmentId, input.projectId);
    let source = yield* store.saveSource({
      sourceId: existing?.sourceId ?? identifiers.sourceId,
      sandboxId: existing?.sandboxId ?? identifiers.sandboxId,
      environmentId,
      projectId: input.projectId,
      logicalProjectKey: input.logicalProjectKey,
      displayName: input.displayName,
      captureEnabled: input.enabled,
      agentAccessEnabled:
        input.agentAccessEnabled ??
        existing?.agentAccessEnabled ??
        serverSettings.emailSandbox.agentAccessByDefault,
      smtpHost: "127.0.0.1",
      smtpPort: existing?.smtpPort ?? null,
      portChanged: existing?.portChanged ?? false,
      status: "disabled",
      lastError: null,
      updatedAt: DateTime.formatIso(DateTime.nowUnsafe()),
    });
    if (!input.enabled) yield* router.stop(source.sourceId);
    yield* reconcile;
    source = (yield* store.getSource(environmentId, input.projectId)) ?? source;
    return source;
  });

  const listMessages: EmailSandboxCoordinatorShape["listMessages"] = Effect.fn(
    "EmailSandboxCoordinator.listMessages",
  )(function* (input) {
    let messages = Array.from(yield* store.listMessages(input.projectId));
    if (input.query !== undefined && input.query.trim().length > 0) {
      const query = input.query.toLocaleLowerCase();
      messages = messages.filter(
        (message) =>
          message.subject.toLocaleLowerCase().includes(query) ||
          message.from.some((address) =>
            `${address.name ?? ""} ${address.address}`.toLocaleLowerCase().includes(query),
          ) ||
          message.to.some((address) =>
            `${address.name ?? ""} ${address.address}`.toLocaleLowerCase().includes(query),
          ),
      );
    }
    if (input.unreadOnly) messages = messages.filter((message) => message.readAt === null);
    if (input.receivedAfter) {
      messages = messages.filter((message) => message.receivedAt > input.receivedAfter!);
    }
    if (input.receivedBefore) {
      messages = messages.filter((message) => message.receivedAt < input.receivedBefore!);
    }
    const offset = input.cursor ? Math.max(0, Number.parseInt(input.cursor, 10) || 0) : 0;
    const limit = input.limit ?? 100;
    const page = messages.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    return {
      messages: page,
      nextCursor: nextOffset < messages.length ? String(nextOffset) : null,
    };
  });

  const requireMessage = Effect.fn("EmailSandboxCoordinator.requireMessage")(function* (
    messageId: EmailMessageId,
  ) {
    const message = yield* store.getMessage(messageId);
    if (message === null) {
      return yield* new EmailSandboxError({
        operation: "get-message",
        reason: "not-found",
        message: "The captured email message was not found on this environment.",
      });
    }
    return message;
  });

  const markRead: EmailSandboxCoordinatorShape["markRead"] = Effect.fn(
    "EmailSandboxCoordinator.markRead",
  )(function* (messageId, read) {
    const message = yield* store.markRead(messageId, read);
    if (message === null) {
      return yield* new EmailSandboxError({
        operation: "mark-read",
        reason: "not-found",
        message: "The captured email message was not found on this environment.",
      });
    }
    return message;
  });

  const projectLogicalKey = (event: {
    readonly workspaceRoot: string;
    readonly repositoryIdentity?:
      | {
          readonly canonicalKey: string;
          readonly rootPath?: string | undefined;
        }
      | null
      | undefined;
  }): string => {
    const normalize = (value: string) =>
      value.trim().replaceAll("\\", "/").replace(/\/+$/gu, "").toLocaleLowerCase();
    const identity = event.repositoryIdentity;
    if (identity) {
      const workspaceRoot = normalize(event.workspaceRoot);
      const repositoryRoot = identity.rootPath ? normalize(identity.rootPath) : null;
      const relative =
        repositoryRoot && workspaceRoot.startsWith(`${repositoryRoot}/`)
          ? workspaceRoot.slice(repositoryRoot.length + 1)
          : "";
      return relative.length > 0 ? `${identity.canonicalKey}::${relative}` : identity.canonicalKey;
    }
    return `${environmentId}:${normalize(event.workspaceRoot)}`;
  };

  yield* reconcile.pipe(
    Effect.catch((error) =>
      Effect.logWarning("Initial email sandbox reconciliation failed", error),
    ),
  );
  yield* settings.streamChanges.pipe(
    Stream.runForEach(() =>
      reconcile.pipe(
        Effect.catch((error) =>
          Effect.logWarning("Email sandbox settings reconciliation failed", error),
        ),
      ),
    ),
    Effect.forkScoped,
  );
  yield* orchestrationEngine.streamDomainEvents.pipe(
    Stream.filter((event) => event.type === "project.created"),
    Stream.runForEach((event) =>
      Effect.gen(function* () {
        if (event.type !== "project.created") return;
        const currentSettings = yield* readSettings;
        if (!currentSettings.emailSandbox.createForNewProjects) return;
        const existing = yield* store.getSource(environmentId, event.payload.projectId);
        if (existing !== null) return;
        yield* setProjectCapture({
          projectId: event.payload.projectId,
          enabled: currentSettings.emailSandbox.captureByDefault,
          agentAccessEnabled: currentSettings.emailSandbox.agentAccessByDefault,
          logicalProjectKey: projectLogicalKey(event.payload),
          displayName: event.payload.title,
        });
      }).pipe(
        Effect.catch((error) =>
          Effect.logWarning("Failed to create the default project email sandbox", {
            eventId: event.eventId,
            error,
          }),
        ),
      ),
    ),
    Effect.forkScoped,
  );

  return EmailSandboxCoordinator.of({
    status: currentStatus,
    reconcile,
    listProjectSources,
    setProjectCapture,
    clearLocalCache: store.clearLocalCache,
    listMessages,
    getMessage: requireMessage,
    markRead,
    deleteMessage: store.deleteMessage,
    getAttachment: store.getAttachment,
    appendAgentAudit: store.appendAgentAudit,
  });
});

export const layer = Layer.effect(EmailSandboxCoordinator, make);
