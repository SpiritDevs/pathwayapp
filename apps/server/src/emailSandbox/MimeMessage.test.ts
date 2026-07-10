import { describe, expect, it } from "@effect/vitest";

import { injectPathwayHeaders, parseMimeMessage } from "./MimeMessage.ts";

describe("MimeMessage", () => {
  it("parses multipart text, html, and attachments", () => {
    const raw = Buffer.from(
      [
        "From: Example <sender@example.test>",
        "To: receiver@example.test",
        "Subject: =?UTF-8?B?SGVsbG8=?=",
        'Content-Type: multipart/mixed; boundary="test-boundary"',
        "",
        "--test-boundary",
        "Content-Type: text/plain; charset=utf-8",
        "",
        "Plain text",
        "--test-boundary",
        "Content-Type: text/html; charset=utf-8",
        "",
        "<p>HTML</p>",
        "--test-boundary",
        "Content-Type: text/plain; name=hello.txt",
        "Content-Disposition: attachment; filename=hello.txt",
        "Content-Transfer-Encoding: base64",
        "",
        "aGVsbG8=",
        "--test-boundary--",
        "",
      ].join("\r\n"),
    );
    const parsed = parseMimeMessage(raw);
    expect(parsed.subject).toBe("Hello");
    expect(parsed.from).toEqual([{ name: "Example", address: "sender@example.test" }]);
    expect(parsed.text).toContain("Plain text");
    expect(parsed.html).toContain("<p>HTML</p>");
    expect(parsed.attachments).toHaveLength(1);
    expect(Buffer.from(parsed.attachments[0]!.bytes).toString()).toBe("hello");
  });

  it("injects stable routing headers ahead of the original message", () => {
    const result = Buffer.from(
      injectPathwayHeaders(Buffer.from("Subject: test\r\n\r\nbody"), {
        captureId: "capture-1",
        sourceId: "source-1",
        sandboxId: "sandbox-1",
        environmentId: "environment-1",
        projectId: "project-1",
        logicalProjectKey: "repo:test",
      }),
    ).toString();
    expect(result).toContain("X-PathwayOS-Capture-Id: capture-1\r\n");
    expect(result).toContain("X-PathwayOS-Logical-Project-Key: repo:test\r\n");
    expect(result).toContain("Subject: test\r\n\r\nbody");
  });
});
