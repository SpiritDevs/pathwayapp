import { useAuth } from "@clerk/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { AUTH_COMPLETE_ROUTE, SIGN_IN_ROUTE } from "~/authRoutes";
import { AuthRouteShell, AuthUnavailableState } from "~/components/auth/AuthRouteShell";
import { PathwayOSRegisterForm } from "~/components/auth/PathwayOSAuthForms";
import { hasClerkPublicConfig } from "~/cloud/publicConfig";
import { SplashScreen } from "~/components/SplashScreen";

export const Route = createFileRoute("/register")({
  component: RegisterRouteView,
});

function RegisterRouteView() {
  if (!hasClerkPublicConfig()) {
    return <AuthUnavailableState />;
  }

  return <ConfiguredRegisterRoute />;
}

function ConfiguredRegisterRoute() {
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
      description="Create a pathwayOS account for profile, managed relay access, and mobile clients."
      eyebrow="Account"
      title="Create your pathwayOS account"
      footer={
        <>
          Already have an account?{" "}
          <Link
            className="font-medium text-foreground underline underline-offset-4"
            to={SIGN_IN_ROUTE}
          >
            Sign in
          </Link>
        </>
      }
    >
      <PathwayOSRegisterForm />
    </AuthRouteShell>
  );
}
