import * as Clock from "effect/Clock";
import * as Crypto from "effect/Crypto";
import * as Data from "effect/Data";
import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Encoding from "effect/Encoding";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Semaphore from "effect/Semaphore";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import {
  HostProcessArchitecture,
  HostProcessEnvironment,
  HostProcessPlatform,
} from "./hostProcess.ts";

export type ManagedToolArchive = "binary" | "tgz" | "zip";

export interface ManagedToolReleaseAsset {
  readonly url: string;
  readonly sha256: string;
  readonly archive: ManagedToolArchive;
  /** Relative path to the executable after extracting an archive. */
  readonly executablePath?: string;
}

export type ManagedToolInstallStage =
  | "checking"
  | "waiting_for_lock"
  | "downloading"
  | "verifying"
  | "installing"
  | "validating"
  | "activating";

export interface ManagedToolDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly version: string;
  readonly executableName: (platform: NodeJS.Platform) => string;
  readonly overrideEnvironmentVariable?: string;
  readonly releaseAssets: Readonly<
    Partial<Record<`${NodeJS.Platform}-${string}`, ManagedToolReleaseAsset>>
  >;
  readonly validation: {
    readonly args: ReadonlyArray<string>;
    readonly matches: (output: string) => boolean;
  };
}

export type ManagedToolExecutableSource = "override" | "managed" | "path";

export type ManagedToolStatus =
  | {
      readonly status: "available";
      readonly executablePath: string;
      readonly source: ManagedToolExecutableSource;
      readonly version: string;
    }
  | {
      readonly status: "missing";
      readonly version: string;
    }
  | {
      readonly status: "unsupported";
      readonly platform: NodeJS.Platform;
      readonly arch: string;
      readonly version: string;
    };

export type AvailableManagedTool = Extract<ManagedToolStatus, { readonly status: "available" }>;

export class ManagedToolInstallError extends Data.TaggedError("ManagedToolInstallError")<{
  readonly toolId: string;
  readonly reason:
    | "download_failed"
    | "invalid_checksum"
    | "install_locked"
    | "override_missing"
    | "unsupported_platform"
    | "validation_failed"
    | "write_failed";
  readonly message: string;
  readonly cause?: unknown;
}> {}

export interface ManagedToolOptions {
  readonly baseDir: string;
  /** Test and downstream escape hatch for a privately mirrored asset. */
  readonly releaseAsset?: ManagedToolReleaseAsset;
  readonly installLock?: {
    readonly retryCount?: number;
    readonly retryDelay?: Duration.Input;
    readonly staleAfterMs?: number;
  };
}

export interface ManagedToolShape {
  readonly resolve: Effect.Effect<ManagedToolStatus>;
  readonly install: Effect.Effect<AvailableManagedTool, ManagedToolInstallError>;
  readonly installWithProgress: (
    report: (stage: ManagedToolInstallStage) => Effect.Effect<void>,
  ) => Effect.Effect<AvailableManagedTool, ManagedToolInstallError>;
}

const DEFAULT_LOCK_RETRY_COUNT = 100;
const DEFAULT_LOCK_RETRY_DELAY = "100 millis";
const DEFAULT_LOCK_STALE_MS = 5 * 60 * 1_000;

function isAlreadyExists(error: PlatformError.PlatformError): boolean {
  return error.reason._tag === "AlreadyExists";
}

const wrapFailure =
  (
    definition: ManagedToolDefinition,
    reason: ManagedToolInstallError["reason"],
    message: string,
  ): (<A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, ManagedToolInstallError, R>) =>
  (effect) =>
    effect.pipe(
      Effect.mapError(
        (cause) =>
          new ManagedToolInstallError({
            toolId: definition.id,
            reason,
            message,
            cause,
          }),
      ),
    );

/**
 * Creates a platform-aware manager for a pinned executable release.
 *
 * Installs are checksum verified, serialized in-process, coordinated across
 * processes with a stale-aware file lock, validated before activation, and
 * activated with an atomic rename.
 */
export const makeManagedTool = Effect.fn("ManagedTool.make")(function* (
  definition: ManagedToolDefinition,
  options: ManagedToolOptions,
): Effect.fn.Return<
  ManagedToolShape,
  never,
  | ChildProcessSpawner.ChildProcessSpawner
  | Crypto.Crypto
  | FileSystem.FileSystem
  | HttpClient.HttpClient
  | Path.Path
> {
  const crypto = yield* Crypto.Crypto;
  const fileSystem = yield* FileSystem.FileSystem;
  const httpClient = yield* HttpClient.HttpClient;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const installSemaphore = yield* Semaphore.make(1);
  const platform = yield* HostProcessPlatform;
  const arch = yield* HostProcessArchitecture;
  const environment = yield* HostProcessEnvironment;
  const executableName = definition.executableName(platform);
  const releaseAsset =
    options.releaseAsset ?? definition.releaseAssets[`${platform}-${arch}`] ?? null;
  const managedPath = path.join(
    options.baseDir,
    "tools",
    definition.id,
    definition.version,
    `${platform}-${arch}`,
    executableName,
  );
  const lockRetryCount = options.installLock?.retryCount ?? DEFAULT_LOCK_RETRY_COUNT;
  const lockRetryDelay = options.installLock?.retryDelay ?? DEFAULT_LOCK_RETRY_DELAY;
  const lockStaleAfterMs = options.installLock?.staleAfterMs ?? DEFAULT_LOCK_STALE_MS;

  const configuredOverride = () => {
    const variable = definition.overrideEnvironmentVariable;
    if (!variable) return undefined;
    const value = environment[variable]?.trim();
    return value && value.length > 0 ? value : undefined;
  };

  const isExecutableFile = Effect.fn("ManagedTool.isExecutableFile")(function* (
    executablePath: string,
  ) {
    const info = yield* fileSystem.stat(executablePath).pipe(Effect.option);
    if (Option.isNone(info) || info.value.type !== "File") return false;
    return platform === "win32" || (info.value.mode & 0o111) !== 0;
  });

  const resolvePathExecutable = Effect.gen(function* () {
    const pathValue = environment.PATH?.trim();
    if (!pathValue) return null;
    const delimiter = platform === "win32" ? ";" : ":";
    for (const directory of pathValue.split(delimiter)) {
      const trimmed = directory.trim().replace(/^"|"$/gu, "");
      if (trimmed.length === 0) continue;
      const candidate = path.join(trimmed, executableName);
      if (yield* isExecutableFile(candidate)) return candidate;
    }
    return null;
  });

  const resolve: ManagedToolShape["resolve"] = Effect.gen(function* () {
    const override = configuredOverride();
    if (override) {
      return (yield* isExecutableFile(override))
        ? {
            status: "available",
            executablePath: override,
            source: "override",
            version: definition.version,
          }
        : { status: "missing", version: definition.version };
    }
    if (yield* isExecutableFile(managedPath)) {
      return {
        status: "available",
        executablePath: managedPath,
        source: "managed",
        version: definition.version,
      };
    }
    const pathExecutable = yield* resolvePathExecutable;
    if (pathExecutable) {
      return {
        status: "available",
        executablePath: pathExecutable,
        source: "path",
        version: definition.version,
      };
    }
    return releaseAsset
      ? { status: "missing", version: definition.version }
      : {
          status: "unsupported",
          platform,
          arch,
          version: definition.version,
        };
  });

  const runCommand = Effect.fn("ManagedTool.runCommand")(function* (
    command: string,
    args: ReadonlyArray<string>,
  ) {
    yield* spawner
      .string(
        ChildProcess.make(command, args, {
          shell: false,
          stderr: "pipe",
          stdout: "pipe",
        }),
      )
      .pipe(
        wrapFailure(
          definition,
          "write_failed",
          `Could not prepare the ${definition.displayName} executable.`,
        ),
      );
  });

  const extractAsset = Effect.fn("ManagedTool.extractAsset")(function* (
    asset: ManagedToolReleaseAsset,
    archivePath: string,
    destination: string,
  ) {
    if (asset.archive === "binary") return;
    if (asset.archive === "tgz") {
      yield* runCommand("tar", ["-xzf", archivePath, "-C", destination]);
      return;
    }
    if (platform === "win32") {
      yield* runCommand("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force",
        archivePath,
        destination,
      ]);
      return;
    }
    yield* runCommand("unzip", ["-q", archivePath, "-d", destination]);
  });

  const downloadAsset = Effect.fn("ManagedTool.downloadAsset")(function* (
    asset: ManagedToolReleaseAsset,
    report: (stage: ManagedToolInstallStage) => Effect.Effect<void>,
  ) {
    yield* report("downloading");
    const response = yield* httpClient.execute(HttpClientRequest.get(asset.url)).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.mapError(
        (cause) =>
          new ManagedToolInstallError({
            toolId: definition.id,
            reason: "download_failed",
            message: `Could not download ${definition.displayName}.`,
            cause,
          }),
      ),
    );
    const bytes = new Uint8Array(
      yield* response.arrayBuffer.pipe(
        Effect.mapError(
          (cause) =>
            new ManagedToolInstallError({
              toolId: definition.id,
              reason: "download_failed",
              message: `Could not read the downloaded ${definition.displayName} archive.`,
              cause,
            }),
        ),
      ),
    );
    yield* report("verifying");
    const checksum = yield* crypto.digest("SHA-256", bytes).pipe(
      Effect.mapError(
        (cause) =>
          new ManagedToolInstallError({
            toolId: definition.id,
            reason: "validation_failed",
            message: `Could not verify the downloaded ${definition.displayName} checksum.`,
            cause,
          }),
      ),
    );
    if (Encoding.encodeHex(checksum) !== asset.sha256.toLowerCase()) {
      return yield* new ManagedToolInstallError({
        toolId: definition.id,
        reason: "invalid_checksum",
        message: `Downloaded ${definition.displayName} checksum did not match the pinned release.`,
      });
    }
    return bytes;
  });

  const acquireInstallLock = Effect.fn("ManagedTool.acquireInstallLock")(function* (
    lockPath: string,
  ) {
    for (let attempt = 0; attempt < lockRetryCount; attempt += 1) {
      const acquired = yield* fileSystem.writeFileString(lockPath, "", { flag: "wx" }).pipe(
        Effect.as(true),
        Effect.catch((error) =>
          isAlreadyExists(error) ? Effect.succeed(false) : Effect.fail(error),
        ),
      );
      if (acquired) return;

      const now = yield* Clock.currentTimeMillis;
      const lockInfo = yield* fileSystem.stat(lockPath).pipe(Effect.option);
      const mtime = Option.flatMap(lockInfo, (info) => info.mtime);
      if (Option.isSome(mtime) && now - mtime.value.getTime() > lockStaleAfterMs) {
        yield* fileSystem.remove(lockPath, { force: true });
        continue;
      }
      yield* Effect.sleep(lockRetryDelay);
    }
    return yield* new ManagedToolInstallError({
      toolId: definition.id,
      reason: "install_locked",
      message: `Another ${definition.displayName} installation is still in progress.`,
    });
  });

  const installUnlocked = Effect.fn("ManagedTool.installUnlocked")(function* (
    report: (stage: ManagedToolInstallStage) => Effect.Effect<void>,
  ) {
    yield* report("checking");
    const existing = yield* resolve;
    if (existing.status === "available") return existing;
    if (configuredOverride()) {
      return yield* new ManagedToolInstallError({
        toolId: definition.id,
        reason: "override_missing",
        message: `${definition.overrideEnvironmentVariable} does not point to an executable file.`,
      });
    }
    if (!releaseAsset) {
      return yield* new ManagedToolInstallError({
        toolId: definition.id,
        reason: "unsupported_platform",
        message: `${definition.displayName} is not available for ${platform}-${arch}.`,
      });
    }

    const managedDirectory = path.dirname(managedPath);
    const lockPath = `${managedPath}.lock`;
    yield* fileSystem
      .makeDirectory(managedDirectory, { recursive: true })
      .pipe(
        wrapFailure(
          definition,
          "write_failed",
          `Could not create the ${definition.displayName} tool directory.`,
        ),
      );
    yield* report("waiting_for_lock");
    yield* acquireInstallLock(lockPath).pipe(
      Effect.catchTag("PlatformError", (cause) =>
        Effect.fail(
          new ManagedToolInstallError({
            toolId: definition.id,
            reason: "write_failed",
            message: `Could not acquire the ${definition.displayName} installation lock.`,
            cause,
          }),
        ),
      ),
    );

    return yield* Effect.gen(function* () {
      const afterLock = yield* resolve;
      if (afterLock.status === "available") return afterLock;

      const tempDirectory = yield* fileSystem.makeTempDirectoryScoped({
        directory: managedDirectory,
        prefix: ".install-",
      });
      const archiveName =
        releaseAsset.archive === "tgz"
          ? `${definition.id}.tar.gz`
          : releaseAsset.archive === "zip"
            ? `${definition.id}.zip`
            : executableName;
      const archivePath = path.join(tempDirectory, archiveName);
      const download = yield* downloadAsset(releaseAsset, report);
      yield* report("installing");
      yield* fileSystem
        .writeFile(archivePath, download)
        .pipe(
          wrapFailure(
            definition,
            "write_failed",
            `Could not write the ${definition.displayName} download.`,
          ),
        );
      yield* extractAsset(releaseAsset, archivePath, tempDirectory);

      const extractedExecutable = path.join(
        tempDirectory,
        releaseAsset.executablePath ?? executableName,
      );
      if (platform !== "win32") {
        yield* fileSystem
          .chmod(extractedExecutable, 0o755)
          .pipe(
            wrapFailure(
              definition,
              "write_failed",
              `Could not make ${definition.displayName} executable.`,
            ),
          );
      }

      yield* report("validating");
      const validationOutput = yield* spawner
        .string(
          ChildProcess.make(extractedExecutable, definition.validation.args, {
            shell: false,
            stderr: "pipe",
            stdout: "pipe",
          }),
        )
        .pipe(
          wrapFailure(
            definition,
            "validation_failed",
            `The downloaded ${definition.displayName} executable did not run.`,
          ),
        );
      if (!definition.validation.matches(validationOutput)) {
        return yield* new ManagedToolInstallError({
          toolId: definition.id,
          reason: "validation_failed",
          message: `The downloaded ${definition.displayName} executable reported an unexpected version.`,
        });
      }

      const stagedPath = `${managedPath}.${yield* crypto.randomUUIDv4}.tmp`;
      yield* report("activating");
      yield* fileSystem
        .rename(extractedExecutable, stagedPath)
        .pipe(
          wrapFailure(
            definition,
            "write_failed",
            `Could not stage the ${definition.displayName} executable.`,
          ),
        );
      yield* fileSystem
        .rename(stagedPath, managedPath)
        .pipe(
          wrapFailure(
            definition,
            "write_failed",
            `Could not activate the ${definition.displayName} executable.`,
          ),
          Effect.ensuring(fileSystem.remove(stagedPath, { force: true }).pipe(Effect.ignore)),
        );
      return {
        status: "available",
        executablePath: managedPath,
        source: "managed",
        version: definition.version,
      } satisfies AvailableManagedTool;
    }).pipe(
      Effect.scoped,
      Effect.ensuring(fileSystem.remove(lockPath, { force: true }).pipe(Effect.ignore)),
      Effect.catch((cause) =>
        cause instanceof ManagedToolInstallError
          ? Effect.fail(cause)
          : Effect.fail(
              new ManagedToolInstallError({
                toolId: definition.id,
                reason: "write_failed",
                message: `Could not install ${definition.displayName}.`,
                cause,
              }),
            ),
      ),
    );
  });

  const installWithProgress: ManagedToolShape["installWithProgress"] = (report) =>
    installSemaphore.withPermit(installUnlocked(report));

  return {
    resolve,
    install: installWithProgress(() => Effect.void),
    installWithProgress,
  };
});
