import {
  EmailCaptureId,
  EmailMessageId,
  EmailSandboxError,
  type EmailSandboxProjectSource,
  type EmailSandboxSourceId,
  type EnvironmentId,
} from "@pathwayos/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as NodeCrypto from "node:crypto";
import * as NodeNet from "node:net";

import * as EmailSandboxStore from "./EmailSandboxStore.ts";
import { injectPathwayHeaders, parseMimeMessage } from "./MimeMessage.ts";

const LOOPBACK_HOST = "127.0.0.1";
export const MAX_SMTP_MESSAGE_BYTES = 25 * 1024 * 1024;
export const isSmtpMessageOversized = (sizeBytes: number): boolean =>
  sizeBytes > MAX_SMTP_MESSAGE_BYTES;

interface SmtpEnvelope {
  from: string | null;
  to: Array<string>;
}

interface ActiveListener {
  readonly server: NodeNet.Server;
  readonly source: EmailSandboxProjectSource;
  readonly smtpPort: number;
  readonly mailpitSmtpPort: number;
}

export interface ProjectSmtpRouterShape {
  readonly start: (
    source: EmailSandboxProjectSource,
    smtpPort: number,
    mailpitSmtpPort: number,
  ) => Effect.Effect<void, EmailSandboxError>;
  readonly stop: (sourceId: EmailSandboxSourceId) => Effect.Effect<void>;
  readonly stopAll: Effect.Effect<void>;
  readonly activeCount: Effect.Effect<number>;
}

export class ProjectSmtpRouter extends Context.Service<ProjectSmtpRouter, ProjectSmtpRouterShape>()(
  "pathwayos/emailSandbox/ProjectSmtpRouter",
) {}

const routerError = (reason: EmailSandboxError["reason"], message: string) =>
  new EmailSandboxError({ operation: "configure-project", reason, message });

const writeSocket = (socket: NodeNet.Socket, value: string | Uint8Array): Promise<void> =>
  new Promise((resolve, reject) => {
    socket.write(value, (error) => (error ? reject(error) : resolve()));
  });

const closeServer = (server: NodeNet.Server): Promise<void> =>
  new Promise((resolve) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });

class SmtpResponseReader {
  private readonly lines: Array<string> = [];
  private readonly waiters: Array<{
    resolve: (response: { code: number; lines: ReadonlyArray<string> }) => void;
    reject: (error: Error) => void;
  }> = [];
  private current: Array<string> = [];

  constructor(socket: NodeNet.Socket) {
    let buffer = "";
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      while (true) {
        const end = buffer.indexOf("\n");
        if (end < 0) break;
        const line = buffer.slice(0, end + 1).replace(/\r?\n$/u, "");
        buffer = buffer.slice(end + 1);
        this.pushLine(line);
      }
    });
    const rejectAll = (error: Error) => {
      for (const waiter of this.waiters.splice(0)) waiter.reject(error);
    };
    socket.on("error", (error) => rejectAll(error));
    socket.on("close", () => rejectAll(new Error("SMTP connection closed unexpectedly.")));
  }

  private pushLine(line: string): void {
    this.current.push(line);
    if (!/^\d{3} /u.test(line)) return;
    const response = { code: Number.parseInt(line.slice(0, 3), 10), lines: this.current };
    this.current = [];
    const waiter = this.waiters.shift();
    if (waiter) waiter.resolve(response);
    else this.lines.push(JSON.stringify(response));
  }

  next(): Promise<{ code: number; lines: ReadonlyArray<string> }> {
    const queued = this.lines.shift();
    if (queued) return Promise.resolve(JSON.parse(queued));
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }
}

const expectSmtpResponse = async (
  reader: SmtpResponseReader,
  accepted: ReadonlyArray<number>,
): Promise<void> => {
  const response = await reader.next();
  if (!accepted.includes(response.code)) {
    throw new Error(`Mailpit SMTP returned ${response.code}: ${response.lines.join(" ")}`);
  }
};

const dotStuff = (raw: Uint8Array): Buffer => {
  const normalized = Buffer.from(raw).toString("binary").replaceAll(/\r?\n/gu, "\r\n");
  return Buffer.from(normalized.replace(/^\./gmu, ".."), "binary");
};

export const forwardRawToMailpit = async (input: {
  readonly port: number;
  readonly envelope: SmtpEnvelope;
  readonly raw: Uint8Array;
}): Promise<void> => {
  const socket = NodeNet.createConnection({ host: LOOPBACK_HOST, port: input.port });
  socket.setTimeout(10_000, () => socket.destroy(new Error("Mailpit SMTP timed out.")));
  const reader = new SmtpResponseReader(socket);
  try {
    await expectSmtpResponse(reader, [220]);
    await writeSocket(socket, "EHLO pathwayos.local\r\n");
    await expectSmtpResponse(reader, [250]);
    await writeSocket(socket, `MAIL FROM:<${input.envelope.from ?? ""}>\r\n`);
    await expectSmtpResponse(reader, [250]);
    for (const recipient of input.envelope.to) {
      await writeSocket(socket, `RCPT TO:<${recipient}>\r\n`);
      await expectSmtpResponse(reader, [250, 251]);
    }
    await writeSocket(socket, "DATA\r\n");
    await expectSmtpResponse(reader, [354]);
    await writeSocket(socket, dotStuff(input.raw));
    await writeSocket(socket, "\r\n.\r\n");
    await expectSmtpResponse(reader, [250]);
    await writeSocket(socket, "QUIT\r\n");
  } finally {
    socket.end();
  }
};

const extractPath = (value: string): string | null => {
  const match = /<([^<>]*)>/u.exec(value);
  const result = (match?.[1] ?? value).trim();
  return result.length > 0 ? result : null;
};

const makeSmtpConnectionHandler = (input: {
  readonly source: EmailSandboxProjectSource;
  readonly environmentId: EnvironmentId;
  readonly mailpitSmtpPort: number;
  readonly persist: EmailSandboxStore.EmailSandboxStoreShape["persistCapture"];
}) => {
  return (socket: NodeNet.Socket): void => {
    socket.setEncoding("binary");
    socket.setTimeout(60_000, () => socket.destroy());
    let commandBuffer = "";
    let dataBuffer = Buffer.alloc(0);
    let dataMode = false;
    let oversized = false;
    let processing = false;
    let envelope: SmtpEnvelope = { from: null, to: [] };

    const respond = (line: string) => {
      if (!socket.destroyed) socket.write(`${line}\r\n`);
    };

    const reset = () => {
      envelope = { from: null, to: [] };
      dataBuffer = Buffer.alloc(0);
      dataMode = false;
      oversized = false;
    };

    const acceptMessage = async (raw: Uint8Array) => {
      if (input.source.sandboxId === null) {
        throw new Error("Email sandbox source has no sandbox identifier.");
      }
      const captureId = EmailCaptureId.make(NodeCrypto.randomUUID());
      const injected = injectPathwayHeaders(raw, {
        captureId,
        sourceId: input.source.sourceId,
        sandboxId: input.source.sandboxId,
        environmentId: input.environmentId,
        projectId: input.source.projectId,
        logicalProjectKey: input.source.logicalProjectKey,
      });
      await forwardRawToMailpit({ port: input.mailpitSmtpPort, envelope, raw: injected });
      const parsed = parseMimeMessage(injected);
      await Effect.runPromise(
        input.persist({
          captureId,
          messageId: EmailMessageId.make(captureId),
          source: input.source,
          receivedAt: DateTime.formatIso(DateTime.nowUnsafe()),
          envelope,
          raw: injected,
          parsed,
        }),
      );
    };

    const finishData = (raw: Buffer) => {
      if (processing) return;
      processing = true;
      socket.pause();
      if (oversized) {
        respond("552 5.3.4 Message exceeds the 25 MB size limit");
        processing = false;
        reset();
        socket.resume();
        return;
      }
      const unstuffed = Buffer.from(raw.toString("binary").replace(/^\.\./gmu, "."), "binary");
      void acceptMessage(unstuffed)
        .then(() => respond("250 2.0.0 Message captured"))
        .catch((error: unknown) => {
          respond("451 4.3.0 Email sandbox could not persist the message");
          void Effect.runPromise(
            Effect.logWarning("Email sandbox SMTP capture failed", {
              sourceId: input.source.sourceId,
              cause: error instanceof Error ? error.message : String(error),
            }),
          );
        })
        .finally(() => {
          processing = false;
          reset();
          socket.resume();
        });
    };

    const processCommand = (rawLine: string) => {
      const line = rawLine.trim();
      const [rawCommand = "", ...rest] = line.split(/\s+/gu);
      const command = rawCommand.toUpperCase();
      const argument = rest.join(" ");
      switch (command) {
        case "EHLO":
          respond("250-pathwayos.local");
          respond(`250-SIZE ${MAX_SMTP_MESSAGE_BYTES}`);
          respond("250 8BITMIME");
          break;
        case "HELO":
          respond("250 pathwayos.local");
          break;
        case "MAIL":
          if (!/^FROM:/iu.test(argument)) {
            respond("501 5.5.4 Expected MAIL FROM");
            break;
          }
          reset();
          envelope.from = extractPath(argument.slice(5));
          respond("250 2.1.0 Sender accepted");
          break;
        case "RCPT": {
          if (!/^TO:/iu.test(argument)) {
            respond("501 5.5.4 Expected RCPT TO");
            break;
          }
          const recipient = extractPath(argument.slice(3));
          if (!recipient) {
            respond("501 5.1.3 Invalid recipient");
            break;
          }
          envelope.to.push(recipient);
          respond("250 2.1.5 Recipient accepted");
          break;
        }
        case "DATA":
          if (envelope.to.length === 0) {
            respond("503 5.5.1 At least one recipient is required");
            break;
          }
          dataMode = true;
          dataBuffer = Buffer.alloc(0);
          oversized = false;
          respond("354 End data with <CRLF>.<CRLF>");
          break;
        case "RSET":
          reset();
          respond("250 2.0.0 Reset");
          break;
        case "NOOP":
          respond("250 2.0.0 OK");
          break;
        case "QUIT":
          respond("221 2.0.0 Bye");
          socket.end();
          break;
        default:
          respond("502 5.5.2 Command not implemented");
      }
    };

    socket.on("data", (chunk: string | Buffer) => {
      if (processing) return;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "binary");
      if (dataMode) {
        dataBuffer = Buffer.concat([dataBuffer, bytes]);
        if (isSmtpMessageOversized(Math.max(0, dataBuffer.byteLength - 5))) oversized = true;
        const terminator = dataBuffer.indexOf("\r\n.\r\n");
        if (terminator >= 0) {
          const raw = dataBuffer.subarray(0, terminator);
          const remainder = dataBuffer.subarray(terminator + 5).toString("binary");
          dataMode = false;
          dataBuffer = Buffer.alloc(0);
          finishData(raw);
          commandBuffer += remainder;
        }
        return;
      }
      commandBuffer += bytes.toString("binary");
      while (true) {
        const newline = commandBuffer.indexOf("\n");
        if (newline < 0) break;
        const line = commandBuffer.slice(0, newline + 1).replace(/\r?\n$/u, "");
        commandBuffer = commandBuffer.slice(newline + 1);
        processCommand(line);
      }
    });
    socket.on("error", () => undefined);
    respond("220 pathwayos.local ESMTP ready");
  };
};

export const make = Effect.gen(function* () {
  const store = yield* EmailSandboxStore.EmailSandboxStore;
  const listenersRef = yield* Ref.make<ReadonlyMap<EmailSandboxSourceId, ActiveListener>>(
    new Map(),
  );

  const stop: ProjectSmtpRouterShape["stop"] = Effect.fn("ProjectSmtpRouter.stop")(function* (
    sourceId,
  ) {
    const listeners = yield* Ref.get(listenersRef);
    const active = listeners.get(sourceId);
    if (!active) return;
    yield* Effect.promise(() => closeServer(active.server));
    const next = new Map(listeners);
    next.delete(sourceId);
    yield* Ref.set(listenersRef, next);
  }, Effect.orDie);

  const start: ProjectSmtpRouterShape["start"] = Effect.fn("ProjectSmtpRouter.start")(
    function* (source, smtpPort, mailpitSmtpPort) {
      const listeners = yield* Ref.get(listenersRef);
      const current = listeners.get(source.sourceId);
      if (
        current?.smtpPort === smtpPort &&
        current.mailpitSmtpPort === mailpitSmtpPort &&
        current.source.logicalProjectKey === source.logicalProjectKey
      ) {
        return;
      }
      yield* stop(source.sourceId);
      const server = NodeNet.createServer(
        makeSmtpConnectionHandler({
          source,
          environmentId: source.environmentId,
          mailpitSmtpPort,
          persist: store.persistCapture,
        }),
      );
      yield* Effect.callback<void, EmailSandboxError>((resume) => {
        const onError = (error: Error) => {
          server.removeListener("listening", onListening);
          resume(Effect.fail(routerError("port-conflict", error.message)));
        };
        const onListening = () => {
          server.removeListener("error", onError);
          resume(Effect.void);
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen({ host: LOOPBACK_HOST, port: smtpPort, exclusive: true });
        return Effect.sync(() => server.close());
      });
      const next = new Map(yield* Ref.get(listenersRef));
      next.set(source.sourceId, { server, source, smtpPort, mailpitSmtpPort });
      yield* Ref.set(listenersRef, next);
      yield* Effect.logInfo("Project email capture SMTP listener started", {
        sourceId: source.sourceId,
        projectId: source.projectId,
        smtpHost: LOOPBACK_HOST,
        smtpPort,
      });
    },
  );

  const stopAll: ProjectSmtpRouterShape["stopAll"] = Effect.gen(function* () {
    const sourceIds = Array.from((yield* Ref.get(listenersRef)).keys());
    yield* Effect.forEach(sourceIds, stop, { concurrency: "unbounded" });
  });

  const router = ProjectSmtpRouter.of({
    start,
    stop,
    stopAll,
    activeCount: Ref.get(listenersRef).pipe(Effect.map((listeners) => listeners.size)),
  });
  yield* Effect.addFinalizer(() => router.stopAll);
  return router;
});

export const layer = Layer.effect(ProjectSmtpRouter, make);
