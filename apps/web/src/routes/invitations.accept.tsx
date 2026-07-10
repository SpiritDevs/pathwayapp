import { useAuth } from "@clerk/react";
import { clientApi } from "@pathwayos/connect-convex/client-api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAction, useConvexAuth, useMutation } from "convex/react";
import { CheckCircle2Icon, LoaderCircleIcon, ShieldAlertIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { SIGN_IN_ROUTE, SIGN_UP_ROUTE } from "../authRoutes";
import { AuthRouteShell, AuthUnavailableState } from "../components/auth/AuthRouteShell";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { hasClerkPublicConfig, hasConvexPublicConfig } from "../cloud/publicConfig";
import { clearPendingInvitation, rememberPendingInvitation } from "../invitationRouting";
import { accountErrorMessage } from "../components/settings/AccountTeamsSettings.logic";

export interface InvitationSearch {
  readonly token: string;
}

export const Route = createFileRoute("/invitations/accept")({
  validateSearch: (search: Record<string, unknown>): InvitationSearch => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  component: InvitationAcceptRoute,
});

function InvitationAcceptRoute() {
  const { token } = Route.useSearch();
  if (!hasClerkPublicConfig() || !hasConvexPublicConfig()) return <AuthUnavailableState />;
  return <ConfiguredInvitationAccept token={token} />;
}

function InvitationShell({ children }: { readonly children: React.ReactNode }) {
  return (
    <AuthRouteShell
      description="Team invitations expire after seven days and are locked to the email address they were sent to."
      eyebrow="Team invitation"
      title="Join a PathwayOS workspace"
    >
      {children}
    </AuthRouteShell>
  );
}

function ConfiguredInvitationAccept({ token }: { readonly token: string }) {
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { isAuthenticated, isLoading: convexAuthLoading } = useConvexAuth();
  const bootstrap = useMutation(clientApi.account.bootstrap);
  const accept = useAction(clientApi.invitations.accept);
  const requested = useRef(false);
  const [state, setState] = useState<"idle" | "accepting" | "accepted" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token && isLoaded && !isSignedIn) rememberPendingInvitation(token);
  }, [isLoaded, isSignedIn, token]);

  useEffect(() => {
    if (!token || !isSignedIn || !isAuthenticated || requested.current) return;
    requested.current = true;
    setState("accepting");
    void bootstrap({})
      .then(() => accept({ token }))
      .then(() => {
        clearPendingInvitation();
        setState("accepted");
      })
      .catch((cause: unknown) => {
        setError(accountErrorMessage(cause));
        setState("failed");
      });
  }, [accept, bootstrap, isAuthenticated, isSignedIn, token]);

  if (!token) {
    return (
      <InvitationShell>
        <Alert variant="error">
          <ShieldAlertIcon />
          <AlertTitle>Invitation link is incomplete</AlertTitle>
          <AlertDescription>Ask the team owner or admin for a new invitation.</AlertDescription>
        </Alert>
      </InvitationShell>
    );
  }

  if (!isLoaded || (isSignedIn && convexAuthLoading) || state === "accepting") {
    return (
      <InvitationShell>
        <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
          <LoaderCircleIcon className="size-6 animate-spin text-muted-foreground" />
          <p className="text-sm font-medium">
            {state === "accepting" ? "Accepting invitation…" : "Checking your account…"}
          </p>
        </div>
      </InvitationShell>
    );
  }

  if (!isSignedIn) {
    return (
      <InvitationShell>
        <div className="space-y-4">
          <Alert variant="info">
            <ShieldAlertIcon />
            <AlertTitle>Sign in with the invited email</AlertTitle>
            <AlertDescription>
              The invitation will continue automatically after authentication.
            </AlertDescription>
          </Alert>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="flex-1" render={<Link to={SIGN_IN_ROUTE} />}>
              Sign in
            </Button>
            <Button className="flex-1" render={<Link to={SIGN_UP_ROUTE} />} variant="outline">
              Create account
            </Button>
          </div>
        </div>
      </InvitationShell>
    );
  }

  if (state === "accepted") {
    return (
      <InvitationShell>
        <div className="space-y-4 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
            <CheckCircle2Icon className="size-6" />
          </div>
          <div>
            <p className="font-semibold">You joined the workspace</p>
            <p className="mt-1 text-sm text-muted-foreground">It is now your active workspace.</p>
          </div>
          <Button render={<Link to="/settings/account" />}>Manage team</Button>
        </div>
      </InvitationShell>
    );
  }

  return (
    <InvitationShell>
      <Alert variant="error">
        <ShieldAlertIcon />
        <AlertTitle>Invitation could not be accepted</AlertTitle>
        <AlertDescription>{error ?? "The invitation is unavailable."}</AlertDescription>
      </Alert>
    </InvitationShell>
  );
}
