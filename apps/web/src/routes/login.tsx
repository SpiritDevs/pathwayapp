import { useAuth } from "@clerk/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { AUTH_COMPLETE_ROUTE, SIGN_UP_ROUTE } from "~/authRoutes";
import { AuthRouteShell, AuthUnavailableState } from "~/components/auth/AuthRouteShell";
import { PathwayOSSignInForm } from "~/components/auth/PathwayOSAuthForms";
import { hasClerkPublicConfig } from "~/cloud/publicConfig";
import { SplashScreen } from "~/components/SplashScreen";

export const Route = createFileRoute("/login")({
  component: LoginRouteView,
});

function LoginRouteView() {
  if (!hasClerkPublicConfig()) {
    return <AuthUnavailableState />;
  }

  return <ConfiguredLoginRoute />;
}

function ConfiguredLoginRoute() {
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
      description="Use your pathwayOS account for profile, managed relay access, and mobile clients."
      eyebrow="Account"
      title="Sign in to pathwayOS"
      footer={
        <>
          New here?{" "}
          <Link
            className="font-medium text-foreground underline underline-offset-4"
            to={SIGN_UP_ROUTE}
          >
            Create an account
          </Link>
        </>
      }
    >
      <PathwayOSSignInForm />
    </AuthRouteShell>
  );
}
