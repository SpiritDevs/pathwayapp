import * as NodeServices from "@effect/platform-node/NodeServices";
import { EnvironmentId, ProjectId } from "@pathwayos/contracts";
import * as Net from "@pathwayos/shared/Net";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeNet from "node:net";

import * as ServerConfig from "../config.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as EmailSandboxStore from "./EmailSandboxStore.ts";
import {
  forwardRawToMailpit,
  isSmtpMessageOversized,
  MAX_SMTP_MESSAGE_BYTES,
  ProjectSmtpRouter,
  layer as projectSmtpRouterLayer,
} from "./ProjectSmtpRouter.ts";

const startFakeMailpit = (): Promise<{
  readonly server: NodeNet.Server;
  readonly port: number;
  readonly messages: Array<Buffer>;
  readonly sockets: Set<NodeNet.Socket>;
}> =>
  new Promise((resolve, reject) => {
    const messages: Array<Buffer> = [];
    const sockets = new Set<NodeNet.Socket>();
    const server = NodeNet.createServer((socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      let buffer = Buffer.alloc(0);
      let dataMode = false;
      socket.write("220 fake-mailpit ESMTP\r\n");
      socket.on("data", (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        while (true) {
          if (dataMode) {
            const end = buffer.indexOf("\r\n.\r\n");
            if (end < 0) return;
            messages.push(buffer.subarray(0, end));
            buffer = buffer.subarray(end + 5);
            dataMode = false;
            socket.write("250 captured\r\n");
            continue;
          }
          const end = buffer.indexOf("\n");
          if (end < 0) return;
          const line = buffer
            .subarray(0, end + 1)
            .toString("utf8")
            .trim();
          buffer = buffer.subarray(end + 1);
          const command = line.split(" ", 1)[0]?.toUpperCase();
          if (command === "DATA") {
            dataMode = true;
            socket.write("354 continue\r\n");
          } else if (command === "QUIT") {
            socket.write("221 bye\r\n");
            socket.end();
          } else {
            socket.write("250 ok\r\n");
          }
        }
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address !== "object" || address === null) {
        reject(new Error("Fake Mailpit did not bind to TCP."));
        return;
      }
      resolve({ server, port: address.port, messages, sockets });
    });
  });

describe("ProjectSmtpRouter", () => {
  it("enforces the exact 25 MB SMTP boundary", () => {
    expect(isSmtpMessageOversized(MAX_SMTP_MESSAGE_BYTES)).toBe(false);
    expect(isSmtpMessageOversized(MAX_SMTP_MESSAGE_BYTES + 1)).toBe(true);
  });

  it.effect("routes a real SMTP transaction through Mailpit and indexes it safely", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const downstream = yield* Effect.acquireRelease(
          Effect.promise(startFakeMailpit),
          ({ server, sockets }) =>
            Effect.promise(
              () =>
                new Promise<void>((resolve) => {
                  for (const socket of sockets) socket.destroy();
                  server.close(() => resolve());
                }),
            ).pipe(Effect.ignore),
        );
        const net = yield* Net.NetService;
        const routerPort = yield* net.reserveLoopbackPort();
        const router = yield* ProjectSmtpRouter;
        const store = yield* EmailSandboxStore.EmailSandboxStore;
        const environmentId = EnvironmentId.make("email-test-environment");
        const projectId = ProjectId.make("email-test-project");
        const identifiers = EmailSandboxStore.localSourceIdentifiers(environmentId, projectId);
        const source = yield* store.saveSource({
          ...identifiers,
          environmentId,
          projectId,
          logicalProjectKey: "repo:email-test",
          displayName: "Email Test",
          captureEnabled: true,
          agentAccessEnabled: true,
          smtpHost: "127.0.0.1",
          smtpPort: routerPort,
          portChanged: false,
          status: "starting",
          lastError: null,
          updatedAt: "2026-07-10T00:00:00.000Z",
        });
        yield* router.start(source, routerPort, downstream.port);
        yield* Effect.promise(() =>
          forwardRawToMailpit({
            port: routerPort,
            envelope: { from: "sender@example.test", to: ["recipient@example.test"] },
            raw: Buffer.from(
              "From: Sender <sender@example.test>\r\nTo: recipient@example.test\r\nSubject: Routed\r\nContent-Type: text/plain\r\n\r\nHello",
            ),
          }),
        );

        expect(downstream.messages).toHaveLength(1);
        const forwarded = downstream.messages[0]!.toString("utf8");
        expect(forwarded).toContain("X-PathwayOS-Capture-Id:");
        expect(forwarded).toContain("X-PathwayOS-Project-Id: email-test-project");

        const messages = yield* store.listMessages(projectId);
        expect(messages).toHaveLength(1);
        expect(messages[0]?.subject).toBe("Routed");
        const detail = yield* store.getMessage(messages[0]!.messageId);
        expect(detail?.text).toContain("Hello");

        const cleared = yield* store.clearLocalCache(projectId);
        expect(cleared.clearedMessages).toBe(0);
        expect(cleared.retainedUnsyncedMessages).toBe(1);

        const pending = yield* store.listPendingCaptureBatch();
        expect(pending).toHaveLength(1);
        expect(pending[0]?.source.logicalProjectKey).toBe("repo:email-test");
        yield* store.markCaptureBatchFailed([pending[0]!.captureId], "offline");
        expect(yield* store.listPendingCaptureBatch()).toHaveLength(1);
        yield* store.markCaptureBatchSynced([pending[0]!.captureId]);
        yield* store.markCaptureBatchSynced([pending[0]!.captureId]);
        expect(yield* store.listPendingCaptureBatch()).toHaveLength(0);
        const clearedSynced = yield* store.clearLocalCache(projectId);
        expect(clearedSynced.clearedMessages).toBe(1);
      }).pipe(
        Effect.provide(
          projectSmtpRouterLayer.pipe(
            Layer.provideMerge(EmailSandboxStore.layer),
            Layer.provideMerge(SqlitePersistenceMemory),
            Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "email-router-test-" })),
            Layer.provideMerge(Net.layer),
            Layer.provideMerge(NodeServices.layer),
          ),
        ),
      ),
    ),
  );
});
