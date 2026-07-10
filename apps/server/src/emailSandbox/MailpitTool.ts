import * as ManagedTool from "@pathwayos/shared/managedTool";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export const MAILPIT_VERSION = "1.30.4";
export const MAILPIT_PATH_ENV_NAME = "PATHWAYOS_MAILPIT_PATH";

export const MAILPIT_RELEASE_ASSETS = {
  "darwin-x64": {
    url: "https://github.com/axllent/mailpit/releases/download/v1.30.4/mailpit-darwin-amd64.tar.gz",
    sha256: "67abb8dfd693eb2a511d6860b33c87bbbdfcf0a0eb7f494134a354e186b4e79b",
    archive: "tgz",
    executablePath: "mailpit",
  },
  "darwin-arm64": {
    url: "https://github.com/axllent/mailpit/releases/download/v1.30.4/mailpit-darwin-arm64.tar.gz",
    sha256: "a8181bbed0e6f82961abbe64df47657efaf53ac7cc0673fb34f0114c925cdaad",
    archive: "tgz",
    executablePath: "mailpit",
  },
  "linux-x64": {
    url: "https://github.com/axllent/mailpit/releases/download/v1.30.4/mailpit-linux-amd64.tar.gz",
    sha256: "e9c104154c22b83ac4c7d19f9d665a5c933585a3caafcd790805d732fa8d03fb",
    archive: "tgz",
    executablePath: "mailpit",
  },
  "linux-arm64": {
    url: "https://github.com/axllent/mailpit/releases/download/v1.30.4/mailpit-linux-arm64.tar.gz",
    sha256: "27f6556c4d922d5ee2afb8b85a799dc2445b894782e7ec0196a566598d107221",
    archive: "tgz",
    executablePath: "mailpit",
  },
  "win32-x64": {
    url: "https://github.com/axllent/mailpit/releases/download/v1.30.4/mailpit-windows-amd64.zip",
    sha256: "151378799345709c00e287a1b00bfee6f7ce5f5e8d0c00cc4133e3bbf2eaabdb",
    archive: "zip",
    executablePath: "mailpit.exe",
  },
  "win32-arm64": {
    url: "https://github.com/axllent/mailpit/releases/download/v1.30.4/mailpit-windows-arm64.zip",
    sha256: "673487b82d979034d7ac6b9e8cbafeb7fcfd4d84bc9b6c619132c211d3dce0d7",
    archive: "zip",
    executablePath: "mailpit.exe",
  },
} as const satisfies ManagedTool.ManagedToolDefinition["releaseAssets"];

export const MAILPIT_TOOL_DEFINITION: ManagedTool.ManagedToolDefinition = {
  id: "mailpit",
  displayName: "Mailpit",
  version: MAILPIT_VERSION,
  executableName: (platform) => (platform === "win32" ? "mailpit.exe" : "mailpit"),
  overrideEnvironmentVariable: MAILPIT_PATH_ENV_NAME,
  releaseAssets: MAILPIT_RELEASE_ASSETS,
  validation: {
    args: ["version"],
    matches: (output) =>
      new RegExp(`\\bv${MAILPIT_VERSION.replaceAll(".", "\\.")}\\b`, "u").test(output),
  },
};

export interface MailpitToolShape extends ManagedTool.ManagedToolShape {}

export class MailpitTool extends Context.Service<MailpitTool, MailpitToolShape>()(
  "pathwayos/emailSandbox/MailpitTool",
) {}

export interface MailpitToolOptions extends ManagedTool.ManagedToolOptions {}

export const make = Effect.fn("MailpitTool.make")(function* (options: MailpitToolOptions) {
  const tool = yield* ManagedTool.makeManagedTool(MAILPIT_TOOL_DEFINITION, options);
  return MailpitTool.of(tool);
});

export const layer = (options: MailpitToolOptions) => Layer.effect(MailpitTool, make(options));
