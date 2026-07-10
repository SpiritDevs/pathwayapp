import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import * as MailpitRuntime from "./MailpitRuntime.ts";
import * as MailpitTool from "./MailpitTool.ts";

const availableToolLayer = Layer.succeed(
  MailpitTool.MailpitTool,
  MailpitTool.MailpitTool.of({
    resolve: Effect.succeed({
      status: "available",
      executablePath: "/managed/mailpit",
      source: "managed",
      version: MailpitTool.MAILPIT_VERSION,
    }),
    install: Effect.succeed({
      status: "available",
      executablePath: "/managed/mailpit",
      source: "managed",
      version: MailpitTool.MAILPIT_VERSION,
    }),
    installWithProgress: () => Effect.die("unused"),
  }),
);

function makeHandle(input: {
  readonly pid: number;
  readonly exitCode: Effect.Effect<ChildProcessSpawner.ExitCode>;
  readonly isRunning: () => boolean;
  readonly onKill: () => Effect.Effect<void>;
}) {
  return ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(input.pid),
    exitCode: input.exitCode,
    isRunning: Effect.sync(input.isRunning),
    kill: () => input.onKill(),
    unref: Effect.succeed(Effect.void),
    stdin: Sink.drain,
    stdout: Stream.empty,
    stderr: Stream.empty,
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
  });
}

const buildRuntime = (spawner: ChildProcessSpawner.ChildProcessSpawner["Service"]) =>
  MailpitRuntime.make({ restartDelay: "1 millis", readinessTimeout: "1s" }).pipe(
    Effect.provide(
      Layer.mergeAll(
        NodeServices.layer,
        availableToolLayer,
        Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner),
      ),
    ),
  );

describe("MailpitTool", () => {
  it("pins v1.30.4 for every supported desktop platform and architecture", () => {
    expect(Object.keys(MailpitTool.MAILPIT_RELEASE_ASSETS).sort()).toEqual([
      "darwin-arm64",
      "darwin-x64",
      "linux-arm64",
      "linux-x64",
      "win32-arm64",
      "win32-x64",
    ]);
    for (const asset of Object.values(MailpitTool.MAILPIT_RELEASE_ASSETS)) {
      expect(asset.url).toContain("/v1.30.4/");
      expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/u);
    }
    expect(
      MailpitTool.MAILPIT_TOOL_DEFINITION.validation.matches(
        "/tmp/mailpit v1.30.4 compiled with go1.26.5 on darwin/arm64",
      ),
    ).toBe(true);
    expect(MailpitTool.MAILPIT_TOOL_DEFINITION.validation.matches("mailpit v1.30.3")).toBe(false);
  });
});

describe("MailpitRuntime", () => {
  it.effect("starts on loopback, deduplicates config, rotates, and stops", () =>
    Effect.gen(function* () {
      const commands: Array<ChildProcess.StandardCommand> = [];
      const killed: Array<number> = [];
      let nextPid = 100;
      const spawner = ChildProcessSpawner.make((command) =>
        Effect.gen(function* () {
          if (!ChildProcess.isStandardCommand(command)) {
            throw new Error("Expected a standard command.");
          }
          commands.push(command);
          const readiness = command.args[0] === "readyz";
          const pid = nextPid++;
          let running = !readiness;
          const exit = yield* Deferred.make<ChildProcessSpawner.ExitCode>();
          if (readiness) {
            yield* Deferred.succeed(exit, ChildProcessSpawner.ExitCode(0));
          }
          const handle = makeHandle({
            pid,
            exitCode: Deferred.await(exit),
            isRunning: () => running,
            onKill: () =>
              Effect.gen(function* () {
                running = false;
                killed.push(pid);
                yield* Deferred.succeed(exit, ChildProcessSpawner.ExitCode(0)).pipe(Effect.ignore);
              }),
          });
          yield* Effect.addFinalizer(() => handle.kill().pipe(Effect.ignore));
          return handle;
        }),
      );
      const runtime = yield* buildRuntime(spawner);
      const firstConfig = {
        databasePath: "/tmp/pathwayos-email/mailpit.db",
        smtpPort: 10_251,
        apiPort: 18_025,
        label: "pathwayOS",
      };

      const started = yield* runtime.applyConfig(firstConfig);
      const deduplicated = yield* runtime.applyConfig(firstConfig);
      const rotated = yield* runtime.applyConfig({ ...firstConfig, smtpPort: 10_252 });
      const stopped = yield* runtime.applyConfig(null);

      expect(started).toEqual({
        status: "running",
        pid: 100,
        version: "1.30.4",
        smtpHost: "127.0.0.1",
        smtpPort: 10_251,
        apiUrl: "http://127.0.0.1:18025",
        databasePath: "/tmp/pathwayos-email/mailpit.db",
      });
      expect(deduplicated).toEqual(started);
      expect(rotated.status).toBe("running");
      expect(stopped).toEqual({ status: "disabled" });
      expect(commands).toHaveLength(4);
      const runtimeCommands = commands.filter((command) => command.args[0] !== "readyz");
      expect(runtimeCommands).toHaveLength(2);
      expect(runtimeCommands[0]?.args).toEqual([
        "--database",
        "/tmp/pathwayos-email/mailpit.db",
        "--smtp",
        "127.0.0.1:10251",
        "--listen",
        "127.0.0.1:18025",
        "--max",
        "0",
        "--max-message-size",
        "25",
        "--disable-version-check",
        "--smtp-disable-rdns",
        "--block-remote-css-and-fonts",
        "--label",
        "pathwayOS",
      ]);
      expect(killed).toContain(100);
      expect(killed).toContain(102);
      expect(yield* runtime.status).toEqual({ status: "disabled" });
    }).pipe(Effect.scoped),
  );

  it.effect("rejects unsafe or conflicting runtime ports before spawning", () =>
    Effect.gen(function* () {
      let spawnCount = 0;
      const spawner = ChildProcessSpawner.make(() =>
        Effect.sync(() => {
          spawnCount += 1;
          throw new Error("should not spawn");
        }),
      );
      const runtime = yield* buildRuntime(spawner);
      const status = yield* runtime.applyConfig({
        databasePath: "/tmp/mailpit.db",
        smtpPort: 10_251,
        apiPort: 10_251,
      });

      expect(status).toEqual({
        status: "failed",
        reason: "Mailpit SMTP and API ports must be different.",
      });
      expect(spawnCount).toBe(0);
    }).pipe(Effect.scoped),
  );

  it.effect("restarts Mailpit after an unexpected process exit", () =>
    Effect.gen(function* () {
      let runtimeSpawnCount = 0;
      let firstExit: Deferred.Deferred<ChildProcessSpawner.ExitCode> | undefined;
      const secondStarted = yield* Deferred.make<void>();
      const spawner = ChildProcessSpawner.make((command) =>
        Effect.gen(function* () {
          if (!ChildProcess.isStandardCommand(command)) {
            throw new Error("Expected a standard command.");
          }
          const readiness = command.args[0] === "readyz";
          const exit = yield* Deferred.make<ChildProcessSpawner.ExitCode>();
          let running = !readiness;
          if (readiness) {
            yield* Deferred.succeed(exit, ChildProcessSpawner.ExitCode(0));
          } else {
            runtimeSpawnCount += 1;
            if (runtimeSpawnCount === 1) firstExit = exit;
            if (runtimeSpawnCount === 2) yield* Deferred.succeed(secondStarted, undefined);
          }
          const handle = makeHandle({
            pid: readiness ? 900 + runtimeSpawnCount : 200 + runtimeSpawnCount,
            exitCode: Deferred.await(exit),
            isRunning: () => running,
            onKill: () =>
              Effect.gen(function* () {
                running = false;
                yield* Deferred.succeed(exit, ChildProcessSpawner.ExitCode(0)).pipe(Effect.ignore);
              }),
          });
          yield* Effect.addFinalizer(() => handle.kill().pipe(Effect.ignore));
          return handle;
        }),
      );
      const runtime = yield* buildRuntime(spawner);
      yield* runtime.applyConfig({
        databasePath: "/tmp/pathwayos-email/restart.db",
        smtpPort: 10_251,
        apiPort: 18_025,
      });
      if (!firstExit) throw new Error("Mailpit was not started.");

      yield* Deferred.succeed(firstExit, ChildProcessSpawner.ExitCode(7));
      while ((yield* runtime.status).status !== "failed") {
        yield* Effect.yieldNow;
      }
      yield* TestClock.adjust("2 millis");
      yield* Deferred.await(secondStarted);
      while ((yield* runtime.status).status !== "running") {
        yield* Effect.yieldNow;
      }

      expect(runtimeSpawnCount).toBe(2);
      expect((yield* runtime.status).status).toBe("running");
    }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
  );
});
