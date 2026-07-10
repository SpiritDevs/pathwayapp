import type {
  EmailSandboxClearLocalResult,
  EmailSandboxProjectSource,
  EmailSandboxRuntimeStatus,
  EmailSandboxSetProjectCaptureInput,
  EnvironmentId,
} from "@pathwayos/contracts";
import { useMemo } from "react";

import { usePrimaryEnvironmentId } from "../state/environments";
import { serverEnvironment } from "../state/server";
import { useAtomCommand } from "../state/use-atom-command";
import { useEnvironmentQuery } from "../state/query";

export interface EmailSandboxViewState {
  readonly environmentId: EnvironmentId | null;
  readonly runtimeStatus: EmailSandboxRuntimeStatus | null;
  readonly projectSources: ReadonlyArray<EmailSandboxProjectSource>;
  readonly isPending: boolean;
  readonly error: string | null;
  readonly refresh: () => void;
  readonly setProjectCapture: (
    input: EmailSandboxSetProjectCaptureInput,
  ) => Promise<EmailSandboxProjectSource>;
  readonly clearLocalCache: (
    projectId?: EmailSandboxProjectSource["projectId"] | undefined,
  ) => Promise<EmailSandboxClearLocalResult>;
}

function resultError(result: { readonly _tag: string; readonly cause?: unknown }): Error {
  return new Error(
    result._tag === "Failure" ? "The email sandbox request failed." : "Unknown error.",
  );
}

export function useEmailSandbox(): EmailSandboxViewState {
  const environmentId = usePrimaryEnvironmentId();
  const runtime = useEnvironmentQuery(
    environmentId === null
      ? null
      : serverEnvironment.emailSandboxRuntimeStatus({ environmentId, input: {} }),
  );
  const sources = useEnvironmentQuery(
    environmentId === null
      ? null
      : serverEnvironment.emailSandboxProjectSources({ environmentId, input: {} }),
  );
  const runSetProjectCapture = useAtomCommand(serverEnvironment.setEmailSandboxProjectCapture, {
    reportFailure: false,
  });
  const runClearLocalCache = useAtomCommand(serverEnvironment.clearEmailSandboxLocalCache, {
    reportFailure: false,
  });

  return useMemo(
    () => ({
      environmentId,
      runtimeStatus: runtime.data,
      projectSources: sources.data ?? [],
      isPending: runtime.isPending || sources.isPending,
      error: runtime.error ?? sources.error,
      refresh: () => {
        runtime.refresh();
        sources.refresh();
      },
      setProjectCapture: async (input: EmailSandboxSetProjectCaptureInput) => {
        if (environmentId === null) {
          throw new Error("Connect an environment before configuring email capture.");
        }
        const result = await runSetProjectCapture({ environmentId, input });
        if (result._tag !== "Success") throw resultError(result);
        runtime.refresh();
        sources.refresh();
        return result.value;
      },
      clearLocalCache: async (projectId?: EmailSandboxProjectSource["projectId"]) => {
        if (environmentId === null) {
          throw new Error("Connect an environment before clearing the email cache.");
        }
        const result = await runClearLocalCache({
          environmentId,
          input: projectId === undefined ? {} : { projectId },
        });
        if (result._tag !== "Success") throw resultError(result);
        runtime.refresh();
        sources.refresh();
        return result.value;
      },
    }),
    [environmentId, runClearLocalCache, runSetProjectCapture, runtime, sources],
  );
}
