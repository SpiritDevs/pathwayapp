import type { EmailAddress } from "@pathwayos/contracts";
import * as NodeCrypto from "node:crypto";

const BODY_PREVIEW_LIMIT_BYTES = 1024 * 1024;
export const EMAIL_ATTACHMENT_SYNC_LIMIT_BYTES = 10 * 1024 * 1024;

export interface ParsedAttachment {
  readonly filename: string;
  readonly contentType: string;
  readonly disposition: "attachment" | "inline" | "unknown";
  readonly contentId: string | null;
  readonly bytes: Uint8Array;
  readonly sha256: string;
}

export interface ParsedMimeMessage {
  readonly from: ReadonlyArray<EmailAddress>;
  readonly to: ReadonlyArray<EmailAddress>;
  readonly cc: ReadonlyArray<EmailAddress>;
  readonly bcc: ReadonlyArray<EmailAddress>;
  readonly replyTo: ReadonlyArray<EmailAddress>;
  readonly subject: string;
  readonly text: string | null;
  readonly html: string | null;
  readonly textTruncated: boolean;
  readonly htmlTruncated: boolean;
  readonly attachments: ReadonlyArray<ParsedAttachment>;
}

interface MimeEntity {
  readonly headers: ReadonlyMap<string, string>;
  readonly body: Uint8Array;
}

const splitHeadersAndBody = (bytes: Uint8Array): MimeEntity => {
  const buffer = Buffer.from(bytes);
  let separator = buffer.indexOf("\r\n\r\n");
  let separatorLength = 4;
  if (separator < 0) {
    separator = buffer.indexOf("\n\n");
    separatorLength = 2;
  }
  if (separator < 0) return { headers: new Map(), body: buffer };
  const headerText = buffer.subarray(0, separator).toString("utf8");
  const unfolded = headerText.replace(/\r?\n[\t ]+/gu, " ");
  const headers = new Map<string, string>();
  for (const line of unfolded.split(/\r?\n/gu)) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    const existing = headers.get(key);
    headers.set(key, existing ? `${existing}, ${value}` : value);
  }
  return { headers, body: buffer.subarray(separator + separatorLength) };
};

const parseHeaderWithParameters = (value: string | undefined) => {
  const [rawType = "", ...rawParameters] = (value ?? "").split(";");
  const parameters = new Map<string, string>();
  for (const rawParameter of rawParameters) {
    const equals = rawParameter.indexOf("=");
    if (equals <= 0) continue;
    const key = rawParameter.slice(0, equals).trim().toLowerCase();
    const rawValue = rawParameter.slice(equals + 1).trim();
    parameters.set(key, rawValue.replace(/^"|"$/gu, ""));
  }
  return { type: rawType.trim().toLowerCase(), parameters };
};

const decodeQuotedPrintable = (body: Uint8Array): Uint8Array => {
  const value = Buffer.from(body)
    .toString("latin1")
    .replace(/=\r?\n/gu, "")
    .replace(/=([0-9A-F]{2})/giu, (_match, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
  return Buffer.from(value, "latin1");
};

const decodeTransfer = (body: Uint8Array, encoding: string | undefined): Uint8Array => {
  switch (encoding?.trim().toLowerCase()) {
    case "base64":
      return Buffer.from(Buffer.from(body).toString("ascii").replaceAll(/\s/gu, ""), "base64");
    case "quoted-printable":
      return decodeQuotedPrintable(body);
    default:
      return body;
  }
};

const decodeMimeWords = (value: string): string =>
  value.replace(
    /=\?([^?]+)\?([bq])\?([^?]*)\?=/giu,
    (_match, charset: string, encoding: string, encoded: string) => {
      const bytes =
        encoding.toLowerCase() === "b"
          ? Buffer.from(encoded, "base64")
          : Buffer.from(
              encoded
                .replaceAll("_", " ")
                .replace(/=([0-9A-F]{2})/giu, (_hexMatch, hex: string) =>
                  String.fromCharCode(Number.parseInt(hex, 16)),
                ),
              "latin1",
            );
      return charset.toLowerCase() === "iso-8859-1"
        ? bytes.toString("latin1")
        : bytes.toString("utf8");
    },
  );

const splitAddressList = (value: string): ReadonlyArray<string> => {
  const parts: Array<string> = [];
  let start = 0;
  let quoted = false;
  let angleDepth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '"' && value[index - 1] !== "\\") quoted = !quoted;
    if (!quoted && char === "<") angleDepth += 1;
    if (!quoted && char === ">") angleDepth = Math.max(0, angleDepth - 1);
    if (!quoted && angleDepth === 0 && char === ",") {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
};

export const parseAddressHeader = (value: string | undefined): ReadonlyArray<EmailAddress> => {
  if (!value) return [];
  return splitAddressList(value).flatMap((raw) => {
    const item = raw.trim();
    if (item.length === 0) return [];
    const bracket = /^(.*?)<([^<>]+)>$/u.exec(item);
    const address = (bracket?.[2] ?? item).trim();
    if (!address.includes("@")) return [];
    const rawName = bracket?.[1]?.trim().replace(/^"|"$/gu, "") ?? "";
    return [{ name: rawName.length > 0 ? decodeMimeWords(rawName) : null, address }];
  });
};

const decodeText = (bytes: Uint8Array, charset: string | undefined): string =>
  Buffer.from(bytes).toString(charset?.toLowerCase() === "iso-8859-1" ? "latin1" : "utf8");

const splitMultipart = (body: Uint8Array, boundary: string): ReadonlyArray<Uint8Array> => {
  const marker = `--${boundary}`;
  const source = Buffer.from(body).toString("latin1");
  return source
    .split(marker)
    .slice(1)
    .map((part) => part.replace(/^\r?\n/gu, "").replace(/\r?\n$/gu, ""))
    .filter((part) => part !== "--" && part.length > 0)
    .map((part) => Buffer.from(part.replace(/\r?\n--$/gu, ""), "latin1"));
};

interface CollectedParts {
  readonly text: Array<string>;
  readonly html: Array<string>;
  readonly attachments: Array<ParsedAttachment>;
}

const collectEntity = (bytes: Uint8Array, collected: CollectedParts): void => {
  const entity = splitHeadersAndBody(bytes);
  const contentType = parseHeaderWithParameters(entity.headers.get("content-type"));
  if (contentType.type.startsWith("multipart/")) {
    const boundary = contentType.parameters.get("boundary");
    if (!boundary) return;
    for (const part of splitMultipart(entity.body, boundary)) collectEntity(part, collected);
    return;
  }

  const decoded = decodeTransfer(entity.body, entity.headers.get("content-transfer-encoding"));
  const disposition = parseHeaderWithParameters(entity.headers.get("content-disposition"));
  const filename =
    disposition.parameters.get("filename") ?? contentType.parameters.get("name") ?? null;
  const isAttachment =
    disposition.type === "attachment" || filename !== null || disposition.type === "inline";
  if (isAttachment) {
    collected.attachments.push({
      filename: decodeMimeWords(filename ?? "attachment"),
      contentType: contentType.type || "application/octet-stream",
      disposition:
        disposition.type === "attachment" || disposition.type === "inline"
          ? disposition.type
          : "unknown",
      contentId: entity.headers.get("content-id")?.replace(/^<|>$/gu, "") ?? null,
      bytes: decoded,
      sha256: NodeCrypto.createHash("sha256").update(decoded).digest("hex"),
    });
    return;
  }

  const text = decodeText(decoded, contentType.parameters.get("charset"));
  if (contentType.type === "text/html") collected.html.push(text);
  else if (contentType.type === "text/plain" || contentType.type.length === 0) {
    collected.text.push(text);
  }
};

const truncateBody = (value: string | null) => {
  if (value === null) return { value: null, truncated: false } as const;
  const bytes = Buffer.from(value, "utf8");
  if (bytes.byteLength <= BODY_PREVIEW_LIMIT_BYTES) return { value, truncated: false } as const;
  return {
    value: bytes.subarray(0, BODY_PREVIEW_LIMIT_BYTES).toString("utf8"),
    truncated: true,
  } as const;
};

export const parseMimeMessage = (raw: Uint8Array): ParsedMimeMessage => {
  const root = splitHeadersAndBody(raw);
  const collected: CollectedParts = { text: [], html: [], attachments: [] };
  collectEntity(raw, collected);
  const text = truncateBody(collected.text.length > 0 ? collected.text.join("\n") : null);
  const html = truncateBody(collected.html.length > 0 ? collected.html.join("\n") : null);
  return {
    from: parseAddressHeader(root.headers.get("from")),
    to: parseAddressHeader(root.headers.get("to")),
    cc: parseAddressHeader(root.headers.get("cc")),
    bcc: parseAddressHeader(root.headers.get("bcc")),
    replyTo: parseAddressHeader(root.headers.get("reply-to")),
    subject: decodeMimeWords(root.headers.get("subject") ?? ""),
    text: text.value,
    html: html.value,
    textTruncated: text.truncated,
    htmlTruncated: html.truncated,
    attachments: collected.attachments,
  };
};

const sanitizeHeaderValue = (value: string): string => value.replaceAll(/[\r\n]/gu, " ");

export const injectPathwayHeaders = (
  raw: Uint8Array,
  headers: {
    readonly captureId: string;
    readonly sourceId: string;
    readonly sandboxId: string;
    readonly environmentId: string;
    readonly projectId: string;
    readonly logicalProjectKey: string;
  },
): Uint8Array => {
  const prefix = [
    `X-PathwayOS-Capture-Id: ${sanitizeHeaderValue(headers.captureId)}`,
    `X-PathwayOS-Source-Id: ${sanitizeHeaderValue(headers.sourceId)}`,
    `X-PathwayOS-Sandbox-Id: ${sanitizeHeaderValue(headers.sandboxId)}`,
    `X-PathwayOS-Environment-Id: ${sanitizeHeaderValue(headers.environmentId)}`,
    `X-PathwayOS-Project-Id: ${sanitizeHeaderValue(headers.projectId)}`,
    `X-PathwayOS-Logical-Project-Key: ${sanitizeHeaderValue(headers.logicalProjectKey)}`,
    "",
  ].join("\r\n");
  return Buffer.concat([Buffer.from(prefix, "utf8"), Buffer.from(raw)]);
};
