import { sha256 } from "@noble/hashes/sha2";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Encoding from "effect/Encoding";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import {
  HostProcessArchitecture,
  HostProcessEnvironment,
  HostProcessPlatform,
} from "./hostProcess.ts";
import {
  ManagedToolInstallError,
  makeManagedTool,
  type ManagedToolDefinition,
} from "./managedTool.ts";

const definition: ManagedToolDefinition = {
  id: "demo",
  displayName: "Demo Tool",
  version: "1.2.3",
  executableName: (platform) => (platform === "win32" ? "demo.exe" : "demo"),
  overrideEnvironmentVariable: "PATHWAYOS_DEMO_PATH",
  releaseAssets: {},
  validation: {
    args: ["version"],
    matches: (output) => output.includes("v1.2.3"),
  },
};

function makeHandle(output: string) {
  const bytes = new TextEncoder().encode(output);
  return ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(100),
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    unref: Effect.succeed(Effect.void),
    stdin: Sink.drain,
    stdout: Stream.make(bytes),
    stderr: Stream.empty,
    all: Stream.make(bytes),
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
  });
}

const makeHttpClientLayer = (bytes: Uint8Array) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.succeed(
        HttpClientResponse.fromWeb(request, new Response(bytes.buffer as ArrayBuffer)),
      ),
    ),
  );

function testLayer(input: {
  readonly bytes: Uint8Array;
  readonly platform?: NodeJS.Platform;
  readonly arch?: NodeJS.Architecture;
  readonly commands?: Array<ChildProcess.StandardCommand>;
}) {
  const commands = input.commands ?? [];
  const spawnerLayer = Layer.effect(
    ChildProcessSpawner.ChildProcessSpawner,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      return ChildProcessSpawner.make((command) =>
        Effect.gen(function* () {
          if (!ChildProcess.isStandardCommand(command)) {
            throw new Error("Expected a standard command.");
          }
          commands.push(command);
          if (command.command === "powershell.exe") {
            const destination = command.args.at(-1);
            if (!destination) throw new Error("Missing archive destination.");
            yield* fileSystem.writeFileString(`${destination}/demo.exe`, "windows-demo");
          }
          return makeHandle(
            command.command.endsWith("demo") || command.command.endsWith("demo.exe")
              ? "demo v1.2.3"
              : "",
          );
        }),
      );
    }),
  ).pipe(Layer.provide(NodeServices.layer));
  return Layer.mergeAll(
    NodeServices.layer,
    makeHttpClientLayer(input.bytes),
    Layer.succeed(HostProcessPlatform, input.platform ?? "linux"),
    Layer.succeed(HostProcessArchitecture, input.arch ?? "x64"),
    Layer.succeed(HostProcessEnvironment, { PATH: "" }),
    spawnerLayer,
  );
}

describe("ManagedTool", () => {
  it.effect("checksum verifies, validates, and atomically activates a binary release", () => {
    const bytes = new TextEncoder().encode("demo-binary");
    const commands: Array<ChildProcess.StandardCommand> = [];
    return Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const baseDir = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "pathwayos-managed-tool-",
      });
      const tool = yield* makeManagedTool(definition, {
        baseDir,
        releaseAsset: {
          url: "https://example.test/demo",
          sha256: Encoding.encodeHex(sha256(bytes)),
          archive: "binary",
        },
      });
      const progress: Array<string> = [];
      const installed = yield* tool.installWithProgress((stage) =>
        Effect.sync(() => {
          progress.push(stage);
        }),
      );

      expect(installed.executablePath).toBe(`${baseDir}/tools/demo/1.2.3/linux-x64/demo`);
      expect(new TextDecoder().decode(yield* fileSystem.readFile(installed.executablePath))).toBe(
        "demo-binary",
      );
      expect(commands.map((command) => command.args)).toEqual([["version"]]);
      expect(progress).toEqual([
        "checking",
        "waiting_for_lock",
        "downloading",
        "verifying",
        "installing",
        "validating",
        "activating",
      ]);
      expect(yield* tool.resolve).toEqual(installed);
    }).pipe(Effect.scoped, Effect.provide(testLayer({ bytes, commands })));
  });

  it.effect("rejects a release whose checksum does not match", () => {
    const bytes = new TextEncoder().encode("tampered");
    return Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const baseDir = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "pathwayos-managed-tool-checksum-",
      });
      const tool = yield* makeManagedTool(definition, {
        baseDir,
        releaseAsset: {
          url: "https://example.test/demo",
          sha256: Encoding.encodeHex(sha256(new TextEncoder().encode("expected"))),
          archive: "binary",
        },
      });

      const error = yield* tool.install.pipe(Effect.flip);
      expect(error).toBeInstanceOf(ManagedToolInstallError);
      expect(error.reason).toBe("invalid_checksum");
      expect(yield* tool.resolve).toEqual({ status: "missing", version: "1.2.3" });
    }).pipe(Effect.scoped, Effect.provide(testLayer({ bytes })));
  });

  it.effect("extracts Windows zip releases with PowerShell before validation", () => {
    const bytes = new TextEncoder().encode("zip-bytes");
    const commands: Array<ChildProcess.StandardCommand> = [];
    return Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const baseDir = yield* fileSystem.makeTempDirectoryScoped({
        prefix: "pathwayos-managed-tool-zip-",
      });
      const tool = yield* makeManagedTool(definition, {
        baseDir,
        releaseAsset: {
          url: "https://example.test/demo.zip",
          sha256: Encoding.encodeHex(sha256(bytes)),
          archive: "zip",
          executablePath: "demo.exe",
        },
      });

      const installed = yield* tool.install;
      expect(installed.executablePath).toBe(`${baseDir}/tools/demo/1.2.3/win32-arm64/demo.exe`);
      expect(commands.map((command) => command.command)).toEqual([
        "powershell.exe",
        expect.stringMatching(/demo\.exe$/u),
      ]);
    }).pipe(
      Effect.scoped,
      Effect.provide(testLayer({ bytes, platform: "win32", arch: "arm64", commands })),
    );
  });
});
