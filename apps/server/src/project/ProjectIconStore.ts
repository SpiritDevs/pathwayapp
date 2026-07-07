/**
 * ProjectIconStore - Persistence for user-uploaded project icons.
 *
 * Icons are stored in the server state directory keyed by a hash of the
 * normalized workspace root, so every project pointing at the same directory
 * shares one icon. A stored icon takes precedence over favicon discovery in
 * the workspace (see ProjectFaviconResolver).
 *
 * @module ProjectIconStore
 */
// @effect-diagnostics nodeBuiltinImport:off
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import {
  inferImageExtension,
  parseBase64DataUrl,
  SAFE_IMAGE_FILE_EXTENSIONS,
} from "../imageMime.ts";

export class ProjectIconWriteError extends Schema.TaggedErrorClass<ProjectIconWriteError>()(
  "ProjectIconWriteError",
  {
    workspaceRoot: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to persist the project icon for workspace ${this.workspaceRoot}.`;
  }
}

export class ProjectIconInvalidImageError extends Schema.TaggedErrorClass<ProjectIconInvalidImageError>()(
  "ProjectIconInvalidImageError",
  {
    workspaceRoot: Schema.String,
  },
) {
  override get message(): string {
    return "The uploaded project icon is not a supported image.";
  }
}

function projectIconBaseName(workspaceRoot: string): string {
  return NodeCrypto.createHash("sha256").update(workspaceRoot).digest("hex");
}

function projectIconPathForExtension(input: {
  readonly projectIconsDir: string;
  readonly workspaceRoot: string;
  readonly extension: string;
}): string {
  return NodePath.join(
    NodePath.resolve(input.projectIconsDir),
    `${projectIconBaseName(input.workspaceRoot)}${input.extension}`,
  );
}

/** Resolve the stored icon file for a workspace root, or null when none exists. */
export function resolveProjectIconPath(input: {
  readonly projectIconsDir: string;
  readonly workspaceRoot: string;
}): string | null {
  for (const extension of SAFE_IMAGE_FILE_EXTENSIONS) {
    const candidate = projectIconPathForExtension({ ...input, extension });
    if (NodeFS.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Persist an uploaded icon for a workspace root, replacing any previously
 * stored icon regardless of its extension.
 */
export const saveProjectIcon = Effect.fn("ProjectIconStore.saveProjectIcon")(function* (input: {
  readonly projectIconsDir: string;
  readonly workspaceRoot: string;
  readonly fileName?: string | undefined;
  readonly dataUrl: string;
  readonly maxBytes: number;
}) {
  const parsed = parseBase64DataUrl(input.dataUrl);
  if (!parsed || !parsed.mimeType.startsWith("image/")) {
    return yield* new ProjectIconInvalidImageError({ workspaceRoot: input.workspaceRoot });
  }
  const extension = inferImageExtension({
    mimeType: parsed.mimeType,
    ...(input.fileName !== undefined ? { fileName: input.fileName } : {}),
  });
  if (!SAFE_IMAGE_FILE_EXTENSIONS.has(extension)) {
    return yield* new ProjectIconInvalidImageError({ workspaceRoot: input.workspaceRoot });
  }
  const bytes = Buffer.from(parsed.base64, "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > input.maxBytes) {
    return yield* new ProjectIconInvalidImageError({ workspaceRoot: input.workspaceRoot });
  }

  const fileSystem = yield* FileSystem.FileSystem;
  const iconPath = projectIconPathForExtension({ ...input, extension });
  const wrapWriteError = (cause: unknown) =>
    new ProjectIconWriteError({ workspaceRoot: input.workspaceRoot, cause });

  yield* fileSystem
    .makeDirectory(NodePath.dirname(iconPath), { recursive: true })
    .pipe(Effect.mapError(wrapWriteError));
  yield* fileSystem
    .writeFile(iconPath, new Uint8Array(bytes))
    .pipe(Effect.mapError(wrapWriteError));

  // Drop stale variants with other extensions so resolution stays unambiguous.
  for (const staleExtension of SAFE_IMAGE_FILE_EXTENSIONS) {
    if (staleExtension === extension) continue;
    const stalePath = projectIconPathForExtension({ ...input, extension: staleExtension });
    yield* fileSystem.remove(stalePath).pipe(Effect.ignore);
  }

  return { iconPath };
});
