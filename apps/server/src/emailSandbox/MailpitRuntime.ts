import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as Semaphore from "effect/Semaphore";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import * as Context from "effect/Context";
import * as Path from "effect/Path";

import * as MailpitTool from "./MailpitTool.ts";

export const MAILPIT_LOOPBACK_HOST = "127.0.0.1";
export const MAILPIT_DEFAULT_MAX_MESSAGE_SIZE_MB = 25;

export interface MailpitRuntimeConfig {
  readonly databasePath: string;
  readonly smtpPort: number;
  readonly apiPort: number;
  readonly maxMessageSizeMb?: number;
  readonly label?: string;
}

export type MailpitRuntimeStatus =
  | { readonly status: "disabled" }
  | {
      readonly status: "failed";
      readonly reason: string;
      readonly smtpHost?: typeof MAILPIT_LOOPBACK_HOST;
      readonly smtpPort?: number;
      readonly apiUrl?: string;
    }
  | {
      readonly status: "running";
      readonly pid: number;
      readonly version: string;
      readonly smtpHost: typeof MAILPIT_LOOPBACK_HOST;
      readonly smtpPort: number;
      readonly apiUrl: string;
      readonly databasePath: string;
    };

export interface MailpitRuntimeShape {
  readonly applyConfig: (
    config: MailpitRuntimeConfig | null,
  ) => Effect.Effect<MailpitRuntimeStatus>;
  readonly status: Effect.Effect<MailpitRuntimeStatus>;
}

export class MailpitRuntime extends Context.Service<MailpitRuntime, MailpitRuntimeShape>()(
  "pathwayos/emailSandbox/MailpitRuntime",
) {}

interface ActiveMailpit {
  readonly child: ChildProcessSpawner.ChildProcessHandle;
  readonly scope: Scope.Closeable;
  readonly configKey: string;
  readonly config: Required<Pick<MailpitRuntimeConfig, "maxMessageSizeMb">> &
    Omit<MailpitRuntimeConfig, "maxMessageSizeMb">;
  readonly executablePath: string;
}

export interface MailpitRuntimeOptions {
  readonly restartDelay?: Duration.Input;
  readonly readinessTimeout?: string;
}

function isValidPort(port: number): boolean {
  return Number.isSafeInteger(port) && port >= 1 && port <= 65_535;
}

export function normalizeMailpitRuntimeConfig(
  config: MailpitRuntimeConfig,
): ActiveMailpit["config"] | string {
  const databasePath = config.databasePath.trim();
  if (databasePath.length === 0) return "Mailpit database path must not be empty.";
  if (!isValidPort(config.smtpPort)) return "Mailpit SMTP port must be between 1 and 65535.";
  if (!isValidPort(config.apiPort)) return "Mailpit API port must be between 1 and 65535.";
  if (config.smtpPort === config.apiPort) return "Mailpit SMTP and API ports must be different.";
  const maxMessageSizeMb = config.maxMessageSizeMb ?? MAILPIT_DEFAULT_MAX_MESSAGE_SIZE_MB;
  if (!Number.isSafeInteger(maxMessageSizeMb) || maxMessageSizeMb < 1) {
    return "Mailpit maximum message size must be a positive whole number of megabytes.";
  }
  const label = config.label?.trim();
  return {
    databasePath,
    smtpPort: config.smtpPort,
    apiPort: config.apiPort,
    maxMessageSizeMb,
    ...(label && label.length > 0 ? { label } : {}),
  };
}

function apiUrl(config: Pick<MailpitRuntimeConfig, "apiPort">): string {
  return `http://${MAILPIT_LOOPBACK_HOST}:${config.apiPort}`;
}

function configKey(config: ActiveMailpit["config"]): string {
  return JSON.stringify(config);
}

export function mailpitProcessArgs(config: ActiveMailpit["config"]): ReadonlyArray<string> {
  return [
    "--database",
    config.databasePath,
    "--smtp",
    `${MAILPIT_LOOPBACK_HOST}:${config.smtpPort}`,
    "--listen",
    `${MAILPIT_LOOPBACK_HOST}:${config.apiPort}`,
    "--max",
    "0",
    "--max-message-size",
    String(config.maxMessageSizeMb),
    "--disable-version-check",
    "--smtp-disable-rdns",
    "--block-remote-css-and-fonts",
    ...(config.label ? ["--label", config.label] : []),
  ];
}

const runningStatus = (active: ActiveMailpit): MailpitRuntimeStatus => ({
  status: "running",
  pid: Number(active.child.pid),
  version: MailpitTool.MAILPIT_VERSION,
  smtpHost: MAILPIT_LOOPBACK_HOST,
  smtpPort: active.config.smtpPort,
  apiUrl: apiUrl(active.config),
  databasePath: active.config.databasePath,
});

const stopActiveMailpit = (active: ActiveMailpit | null) =>
  active
    ? Scope.close(active.scope, Exit.void).pipe(
        Effect.tap(() =>
          Effect.logInfo("Mailpit stopped", {
            pid: Number(active.child.pid),
          }),
        ),
        Effect.ignore,
      )
    : Effect.void;

export const make = Effect.fn("MailpitRuntime.make")(function* (
  options: MailpitRuntimeOptions = {},
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const tool = yield* MailpitTool.MailpitTool;
  const activeRef = yield* Ref.make<ActiveMailpit | null>(null);
  const desiredConfigRef = yield* Ref.make<ActiveMailpit["config"] | null>(null);
  const statusRef = yield* Ref.make<MailpitRuntimeStatus>({ status: "disabled" });
  const reconcileSemaphore = yield* Semaphore.make(1);
  const restartDelay = options.restartDelay ?? "1 second";
  const readinessTimeout = options.readinessTimeout ?? "10s";
  let reconcile: (config: ActiveMailpit["config"] | null) => Effect.Effect<MailpitRuntimeStatus>;

  const stopActive = Effect.gen(function* () {
    const active = yield* Ref.getAndSet(activeRef, null);
    yield* stopActiveMailpit(active);
  });

  const observeOutput = (active: ActiveMailpit) =>
    active.child.all.pipe(
      Stream.decodeText(),
      Stream.splitLines,
      Stream.map((line) => line.trim()),
      Stream.filter((line) => line.length > 0),
      Stream.runForEach((output) =>
        /\b(?:error|fatal|panic)\b/iu.test(output)
          ? Effect.logWarning("Mailpit output", { pid: Number(active.child.pid), output })
          : Effect.logDebug("Mailpit output", { pid: Number(active.child.pid), output }),
      ),
      Effect.catchCause((cause) =>
        Effect.logWarning("Mailpit output observer failed", {
          cause,
          pid: Number(active.child.pid),
        }),
      ),
    );

  const supervise = (active: ActiveMailpit) =>
    Effect.gen(function* () {
      const result = yield* Effect.result(active.child.exitCode);
      yield* reconcileSemaphore.withPermits(1)(
        Effect.gen(function* () {
          const current = yield* Ref.get(activeRef);
          if (current?.child.pid !== active.child.pid || current.configKey !== active.configKey) {
            return;
          }
          yield* Ref.set(activeRef, null);
          yield* stopActiveMailpit(active);

          const desired = yield* Ref.get(desiredConfigRef);
          if (!desired || configKey(desired) !== active.configKey) return;

          const reason = Result.isSuccess(result)
            ? `Mailpit exited with code ${Number(result.success)}; restarting.`
            : "Mailpit exited unexpectedly; restarting.";
          yield* Ref.set(statusRef, {
            status: "failed",
            reason,
            smtpHost: MAILPIT_LOOPBACK_HOST,
            smtpPort: desired.smtpPort,
            apiUrl: apiUrl(desired),
          });
          yield* Effect.logWarning(reason, { pid: Number(active.child.pid) });
          yield* Effect.sleep(restartDelay);
          const stillDesired = yield* Ref.get(desiredConfigRef);
          if (stillDesired && configKey(stillDesired) === active.configKey) {
            yield* reconcile(stillDesired);
          }
        }),
      );
    }).pipe(
      Effect.catchCause((cause) => Effect.logWarning("Mailpit supervisor failed", { cause })),
    );

  reconcile = Effect.fn("MailpitRuntime.reconcile")(function* (config) {
    if (!config) {
      yield* stopActive;
      const disabled = { status: "disabled" } as const;
      yield* Ref.set(statusRef, disabled);
      return disabled;
    }

    const nextKey = configKey(config);
    const active = yield* Ref.get(activeRef);
    if (active?.configKey === nextKey) {
      const isRunning = yield* active.child.isRunning.pipe(Effect.orElseSucceed(() => false));
      if (isRunning) {
        const status = runningStatus(active);
        yield* Ref.set(statusRef, status);
        return status;
      }
    }

    yield* stopActive;
    const executable = yield* tool.install.pipe(Effect.result);
    if (Result.isFailure(executable)) {
      const failed = {
        status: "failed",
        reason: executable.failure.message,
        smtpHost: MAILPIT_LOOPBACK_HOST,
        smtpPort: config.smtpPort,
        apiUrl: apiUrl(config),
      } satisfies MailpitRuntimeStatus;
      yield* Ref.set(statusRef, failed);
      return failed;
    }

    const databaseDirectory = path.dirname(config.databasePath);
    const directoryCreated = yield* fileSystem
      .makeDirectory(databaseDirectory, { recursive: true })
      .pipe(Effect.result);
    if (Result.isFailure(directoryCreated)) {
      const failed = {
        status: "failed",
        reason: `Could not create the Mailpit data directory: ${String(directoryCreated.failure)}`,
        smtpHost: MAILPIT_LOOPBACK_HOST,
        smtpPort: config.smtpPort,
        apiUrl: apiUrl(config),
      } satisfies MailpitRuntimeStatus;
      yield* Ref.set(statusRef, failed);
      return failed;
    }

    const processScope = yield* Scope.make("sequential");
    const childResult = yield* spawner
      .spawn(
        ChildProcess.make(executable.success.executablePath, mailpitProcessArgs(config), {
          detached: false,
          shell: false,
          stderr: "pipe",
          stdout: "pipe",
        }),
      )
      .pipe(Effect.provideService(Scope.Scope, processScope), Effect.result);
    if (Result.isFailure(childResult)) {
      yield* Scope.close(processScope, Exit.void).pipe(Effect.ignore);
      const failed = {
        status: "failed",
        reason: `Could not start Mailpit: ${String(childResult.failure)}`,
        smtpHost: MAILPIT_LOOPBACK_HOST,
        smtpPort: config.smtpPort,
        apiUrl: apiUrl(config),
      } satisfies MailpitRuntimeStatus;
      yield* Ref.set(statusRef, failed);
      return failed;
    }

    const activeProcess = {
      child: childResult.success,
      scope: processScope,
      config,
      configKey: nextKey,
      executablePath: executable.success.executablePath,
    } satisfies ActiveMailpit;
    const ready = yield* spawner
      .string(
        ChildProcess.make(
          activeProcess.executablePath,
          [
            "readyz",
            "--listen",
            `${MAILPIT_LOOPBACK_HOST}:${config.apiPort}`,
            "--wait",
            "--timeout",
            readinessTimeout,
          ],
          { shell: false, stderr: "pipe", stdout: "pipe" },
        ),
      )
      .pipe(Effect.result);
    if (Result.isFailure(ready)) {
      yield* stopActiveMailpit(activeProcess);
      const failed = {
        status: "failed",
        reason: `Mailpit did not become ready: ${String(ready.failure)}`,
        smtpHost: MAILPIT_LOOPBACK_HOST,
        smtpPort: config.smtpPort,
        apiUrl: apiUrl(config),
      } satisfies MailpitRuntimeStatus;
      yield* Ref.set(statusRef, failed);
      return failed;
    }

    yield* Ref.set(activeRef, activeProcess);
    const status = runningStatus(activeProcess);
    yield* Ref.set(statusRef, status);
    yield* Effect.logInfo("Mailpit started", status);
    yield* Effect.forkIn(observeOutput(activeProcess), processScope);
    yield* Effect.forkIn(supervise(activeProcess), processScope);
    return status;
  });

  const applyConfig: MailpitRuntimeShape["applyConfig"] = (input) =>
    reconcileSemaphore.withPermits(1)(
      Effect.gen(function* () {
        if (!input) {
          yield* Ref.set(desiredConfigRef, null);
          return yield* reconcile(null);
        }
        const normalized = normalizeMailpitRuntimeConfig(input);
        if (typeof normalized === "string") {
          yield* Ref.set(desiredConfigRef, null);
          yield* stopActive;
          const failed = { status: "failed", reason: normalized } as const;
          yield* Ref.set(statusRef, failed);
          return failed;
        }
        yield* Ref.set(desiredConfigRef, normalized);
        return yield* reconcile(normalized);
      }),
    );

  const runtime = MailpitRuntime.of({
    applyConfig,
    status: Ref.get(statusRef),
  });
  yield* Effect.addFinalizer(() => runtime.applyConfig(null).pipe(Effect.ignore));
  return runtime;
});

export const layer = (options: MailpitRuntimeOptions = {}) =>
  Layer.effect(MailpitRuntime, make(options));
