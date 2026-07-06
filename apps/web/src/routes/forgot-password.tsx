import { useAuth } from "@clerk/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { AUTH_COMPLETE_ROUTE, SIGN_IN_ROUTE, SIGN_UP_ROUTE } from "~/authRoutes";
import { AuthRouteShell, AuthUnavailableState } from "~/components/auth/AuthRouteShell";
import { PathwayOSForgotPasswordForm } from "~/components/auth/PathwayOSAuthForms";
import { hasClerkPublicConfig } from "~/cloud/publicConfig";
import { SplashScreen } from "~/components/SplashScreen";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordRouteView,
});

function ForgotPasswordRouteView() {
  if (!hasClerkPublicConfig()) {
    return <AuthUnavailableState />;
  }

  return <ConfiguredForgotPasswordRoute />;
}

function ConfiguredForgotPasswordRoute() {
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      void navigate({ to: AUTH_COMPLETE_ROUTE, replace: true });
    }
  }, [isLoaded, isSignedIn, navigate]);

  if (!isLoaded || isSignedIn) {
    return <SplashScreen />;
  }

  return (
    <AuthRouteShell
      description="Enter your account email and choose a new password after the reset code arrives."
      eyebrow="Account recovery"
      title="Reset your password"
      footer={
        <>
          Remembered it?{" "}
          <Link
            className="font-medium text-foreground underline underline-offset-4"
            to={SIGN_IN_ROUTE}
          >
            Sign in
          </Link>
          <span className="mx-2 text-muted-foreground/60">/</span>
          <Link
            className="font-medium text-foreground underline underline-offset-4"
            to={SIGN_UP_ROUTE}
          >
            Create an account
          </Link>
        </>
      }
    >
      <PathwayOSForgotPasswordForm />
    </AuthRouteShell>
  );
}
