import { isClerkAPIResponseError } from "@clerk/react/errors";
import { useSignIn, useSignUp } from "@clerk/react/legacy";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  KeyRoundIcon,
  LogInIcon,
  MailIcon,
  RotateCcwIcon,
  UserPlusIcon,
} from "lucide-react";
import type { ComponentProps, FormEvent, ReactNode } from "react";
import { useState } from "react";

import { AUTH_COMPLETE_ROUTE, FORGOT_PASSWORD_ROUTE } from "~/authRoutes";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Spinner } from "~/components/ui/spinner";
import { consumePendingInvitation } from "~/invitationRouting";

type AuthFormStatus = "idle" | "submitting";
type LoadedSignInResource = NonNullable<ReturnType<typeof useSignIn>["signIn"]>;
type LoadedSignInSetActive = NonNullable<ReturnType<typeof useSignIn>["setActive"]>;
type SignInSecondFactor = NonNullable<LoadedSignInResource["supportedSecondFactors"]>[number];
type ClientTrustVerificationStrategy = "email_code" | "phone_code" | "totp" | "backup_code";
type ClientTrustVerificationFactor = Extract<
  SignInSecondFactor,
  { readonly strategy: ClientTrustVerificationStrategy }
>;

export function getClerkAuthErrorMessage(error: unknown): string {
  if (isClerkAPIResponseError(error)) {
    return error.errors
      .map((item) => item.longMessage ?? item.message)
      .filter(Boolean)
      .join(" ");
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

function formatClerkFields(fields: readonly string[]): string {
  return fields.map((field) => field.replaceAll("_", " ")).join(", ");
}

function getUnsupportedSignInStatusMessage(status: string | null): string {
  switch (status) {
    case "needs_second_factor":
      return "This account requires a second verification step. MFA will be added to this custom flow next.";
    case "needs_new_password":
      return "This account needs a new password. Use reset password to continue.";
    case "needs_client_trust":
      return "Clerk needs additional device verification before this sign-in can continue.";
    default:
      return "Clerk returned an auth state this form does not support yet.";
  }
}

function isClientTrustVerificationFactor(
  factor: SignInSecondFactor,
): factor is ClientTrustVerificationFactor {
  return (
    factor.strategy === "email_code" ||
    factor.strategy === "phone_code" ||
    factor.strategy === "totp" ||
    factor.strategy === "backup_code"
  );
}

function resolveClientTrustVerificationFactor(
  factors: LoadedSignInResource["supportedSecondFactors"],
) {
  const supportedFactors = factors?.filter(isClientTrustVerificationFactor) ?? [];
  return (
    supportedFactors.find((factor) => factor.strategy === "email_code") ??
    supportedFactors.find((factor) => factor.strategy === "phone_code") ??
    supportedFactors.find((factor) => factor.strategy === "totp") ??
    supportedFactors.find((factor) => factor.strategy === "backup_code") ??
    null
  );
}

function getClientTrustFactorTarget(factor: ClientTrustVerificationFactor) {
  if ("safeIdentifier" in factor && factor.safeIdentifier) {
    return factor.safeIdentifier;
  }

  return factor.strategy === "phone_code" ? "your phone" : "your account";
}

function getClientTrustVerificationNotice(factor: ClientTrustVerificationFactor) {
  const target = getClientTrustFactorTarget(factor);
  switch (factor.strategy) {
    case "email_code":
      return `We sent a device verification code to ${target}.`;
    case "phone_code":
      return `We sent a device verification code to ${target}.`;
    case "totp":
      return "Enter the code from your authenticator app to trust this device.";
    case "backup_code":
      return "Enter one of your backup codes to trust this device.";
  }
}

function getClientTrustVerificationLabel(factor: ClientTrustVerificationFactor) {
  switch (factor.strategy) {
    case "email_code":
      return "Email verification code";
    case "phone_code":
      return "SMS verification code";
    case "totp":
      return "Authenticator code";
    case "backup_code":
      return "Backup code";
  }
}

function canResendClientTrustCode(factor: ClientTrustVerificationFactor) {
  return factor.strategy === "email_code" || factor.strategy === "phone_code";
}

function AuthFormError({ message }: { readonly message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/32 bg-destructive/4 px-3 py-2 text-destructive-foreground text-sm">
      <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
      <p>{message}</p>
    </div>
  );
}

function AuthFormNotice({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-success/32 bg-success/4 px-3 py-2 text-sm">
      <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-success" />
      <p className="text-muted-foreground">{children}</p>
    </div>
  );
}

function AuthFormField({
  id,
  label,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function AuthSubmitButton({
  children,
  icon,
  isBusy,
  busyLabel,
}: {
  readonly children: ReactNode;
  readonly icon: ReactNode;
  readonly isBusy: boolean;
  readonly busyLabel: string;
}) {
  return (
    <Button className="w-full" disabled={isBusy} size="lg" type="submit">
      {isBusy ? <Spinner className="size-4" /> : icon}
      {isBusy ? busyLabel : children}
    </Button>
  );
}

function PasswordInput(props: ComponentProps<typeof Input>) {
  return <Input autoComplete="current-password" nativeInput type="password" {...props} />;
}

type SignInStep = "credentials" | "client-trust";

export function PathwayOSSignInForm() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const navigate = useNavigate();
  const [step, setStep] = useState<SignInStep>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [clientTrustCode, setClientTrustCode] = useState("");
  const [clientTrustFactor, setClientTrustFactor] = useState<ClientTrustVerificationFactor | null>(
    null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthFormStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const isBusy = !isLoaded || status === "submitting";

  async function activateSignInSession(
    createdSessionId: string | null,
    setActiveResource: LoadedSignInSetActive,
  ) {
    if (!createdSessionId) {
      setError("Clerk completed sign in but did not return a session.");
      return;
    }

    await setActiveResource({ session: createdSessionId });
    const pendingInvitationPath = consumePendingInvitation();
    if (pendingInvitationPath) {
      const token = new URL(pendingInvitationPath, window.location.origin).searchParams.get(
        "token",
      );
      if (token) {
        void navigate({ to: "/invitations/accept", search: { token }, replace: true });
        return;
      }
    }
    void navigate({ to: AUTH_COMPLETE_ROUTE, replace: true });
  }

  async function prepareClientTrustVerification(signInResource: LoadedSignInResource) {
    const factor = resolveClientTrustVerificationFactor(signInResource.supportedSecondFactors);
    if (!factor) {
      setError(
        "Clerk needs a device verification method that this custom sign-in screen does not support yet.",
      );
      return;
    }

    setClientTrustFactor(factor);
    setClientTrustCode("");

    if (factor.strategy === "email_code") {
      await signInResource.prepareSecondFactor({
        emailAddressId: factor.emailAddressId,
        strategy: "email_code",
      });
    } else if (factor.strategy === "phone_code") {
      await signInResource.prepareSecondFactor({
        phoneNumberId: factor.phoneNumberId,
        strategy: "phone_code",
      });
    }

    setStep("client-trust");
    setNotice(getClientTrustVerificationNotice(factor));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded) {
      return;
    }

    setError(null);
    setNotice(null);
    setStatus("submitting");
    try {
      const result = await signIn.create({
        identifier: email.trim(),
        password,
        strategy: "password",
      });

      if (result.status === "complete") {
        await activateSignInSession(result.createdSessionId, setActive);
        return;
      }

      if (result.status === "needs_client_trust") {
        await prepareClientTrustVerification(result);
        return;
      }

      setError(getUnsupportedSignInStatusMessage(result.status));
    } catch (cause) {
      setError(getClerkAuthErrorMessage(cause));
    } finally {
      setStatus("idle");
    }
  }

  async function handleClientTrustSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded || !clientTrustFactor) {
      return;
    }

    setError(null);
    setStatus("submitting");
    try {
      const result = await signIn.attemptSecondFactor({
        code: clientTrustCode.trim(),
        strategy: clientTrustFactor.strategy,
      });

      if (result.status === "complete") {
        await activateSignInSession(result.createdSessionId, setActive);
        return;
      }

      if (result.status === "needs_client_trust") {
        setError("Clerk still needs device verification. Check the code and try again.");
        return;
      }

      setError(getUnsupportedSignInStatusMessage(result.status));
    } catch (cause) {
      setError(getClerkAuthErrorMessage(cause));
    } finally {
      setStatus("idle");
    }
  }

  async function handleResendClientTrustCode() {
    if (!isLoaded || !clientTrustFactor || isBusy || !canResendClientTrustCode(clientTrustFactor)) {
      return;
    }

    setError(null);
    setNotice(null);
    setStatus("submitting");
    try {
      await prepareClientTrustVerification(signIn);
    } catch (cause) {
      setError(getClerkAuthErrorMessage(cause));
    } finally {
      setStatus("idle");
    }
  }

  if (step === "client-trust" && clientTrustFactor) {
    return (
      <form className="grid gap-4" onSubmit={handleClientTrustSubmit}>
        <AuthFormError message={error} />
        {notice ? <AuthFormNotice>{notice}</AuthFormNotice> : null}

        <AuthFormField
          id="pathwayos-login-client-trust-code"
          label={getClientTrustVerificationLabel(clientTrustFactor)}
        >
          <Input
            autoComplete="one-time-code"
            id="pathwayos-login-client-trust-code"
            inputMode={clientTrustFactor.strategy === "backup_code" ? "text" : "numeric"}
            nativeInput
            onChange={(event) => setClientTrustCode(event.currentTarget.value)}
            required
            value={clientTrustCode}
          />
        </AuthFormField>

        <AuthSubmitButton
          busyLabel="Verifying..."
          icon={<KeyRoundIcon className="size-4" />}
          isBusy={isBusy}
        >
          Verify device
        </AuthSubmitButton>

        {canResendClientTrustCode(clientTrustFactor) ? (
          <Button
            disabled={isBusy}
            onClick={handleResendClientTrustCode}
            type="button"
            variant="outline"
          >
            <RotateCcwIcon className="size-4" />
            Resend code
          </Button>
        ) : null}

        <Button
          disabled={isBusy}
          onClick={() => {
            setStep("credentials");
            setClientTrustFactor(null);
            setClientTrustCode("");
            setError(null);
            setNotice(null);
          }}
          type="button"
          variant="ghost"
        >
          Use a different account
        </Button>
      </form>
    );
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <AuthFormError message={error} />

      <AuthFormField id="pathwayos-login-email" label="Email">
        <Input
          autoComplete="email"
          id="pathwayos-login-email"
          nativeInput
          onChange={(event) => setEmail(event.currentTarget.value)}
          required
          type="email"
          value={email}
        />
      </AuthFormField>

      <AuthFormField id="pathwayos-login-password" label="Password">
        <PasswordInput
          autoComplete="current-password"
          id="pathwayos-login-password"
          onChange={(event) => setPassword(event.currentTarget.value)}
          required
          value={password}
        />
      </AuthFormField>

      <div className="-mt-1 text-right">
        <Link
          className="text-muted-foreground text-sm underline underline-offset-4 hover:text-foreground"
          to={FORGOT_PASSWORD_ROUTE}
        >
          Reset password
        </Link>
      </div>

      <AuthSubmitButton
        busyLabel="Signing in..."
        icon={<LogInIcon className="size-4" />}
        isBusy={isBusy}
      >
        Sign in
      </AuthSubmitButton>
    </form>
  );
}

type RegisterStep = "details" | "verify-email";
type LoadedSignUpResource = NonNullable<ReturnType<typeof useSignUp>["signUp"]>;
type LoadedSetActive = NonNullable<ReturnType<typeof useSignUp>["setActive"]>;

export function PathwayOSRegisterForm() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const navigate = useNavigate();
  const [step, setStep] = useState<RegisterStep>("details");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [status, setStatus] = useState<AuthFormStatus>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isBusy = !isLoaded || status === "submitting";

  async function activateCreatedSession(
    createdSessionId: string | null,
    setActiveResource: LoadedSetActive,
  ) {
    if (!createdSessionId) {
      setError("Clerk completed registration but did not return a session.");
      return;
    }

    await setActiveResource({ session: createdSessionId });
    const pendingInvitationPath = consumePendingInvitation();
    if (pendingInvitationPath) {
      const token = new URL(pendingInvitationPath, window.location.origin).searchParams.get(
        "token",
      );
      if (token) {
        void navigate({ to: "/invitations/accept", search: { token }, replace: true });
        return;
      }
    }
    void navigate({ to: AUTH_COMPLETE_ROUTE, replace: true });
  }

  async function prepareEmailVerification(signUpResource: LoadedSignUpResource) {
    await signUpResource.prepareEmailAddressVerification({ strategy: "email_code" });
    setStep("verify-email");
    setNotice(`We sent a verification code to ${email.trim()}.`);
  }

  async function handleDetailsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded) {
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError(null);
    setNotice(null);
    setStatus("submitting");
    try {
      const createParams = {
        emailAddress: email.trim(),
        password,
        ...(firstName.trim() ? { firstName: firstName.trim() } : {}),
        ...(lastName.trim() ? { lastName: lastName.trim() } : {}),
      };
      const result = await signUp.create(createParams);

      if (result.status === "complete") {
        await activateCreatedSession(result.createdSessionId, setActive);
        return;
      }

      if (result.unverifiedFields.includes("email_address")) {
        await prepareEmailVerification(signUp);
        return;
      }

      setError(
        result.missingFields.length > 0
          ? `This Clerk configuration requires: ${formatClerkFields(result.missingFields)}.`
          : "Clerk returned a registration state this form does not support yet.",
      );
    } catch (cause) {
      setError(getClerkAuthErrorMessage(cause));
    } finally {
      setStatus("idle");
    }
  }

  async function handleVerifySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded) {
      return;
    }

    setError(null);
    setStatus("submitting");
    try {
      const result = await signUp.attemptEmailAddressVerification({
        code: verificationCode.trim(),
      });

      if (result.status === "complete") {
        await activateCreatedSession(result.createdSessionId, setActive);
        return;
      }

      setError(
        result.missingFields.length > 0
          ? `This Clerk configuration requires: ${formatClerkFields(result.missingFields)}.`
          : "Clerk could not complete email verification yet.",
      );
    } catch (cause) {
      setError(getClerkAuthErrorMessage(cause));
    } finally {
      setStatus("idle");
    }
  }

  async function handleResendCode() {
    if (!isLoaded || isBusy) {
      return;
    }

    setError(null);
    setNotice(null);
    setStatus("submitting");
    try {
      await prepareEmailVerification(signUp);
    } catch (cause) {
      setError(getClerkAuthErrorMessage(cause));
    } finally {
      setStatus("idle");
    }
  }

  if (step === "verify-email") {
    return (
      <form className="grid gap-4" onSubmit={handleVerifySubmit}>
        <AuthFormError message={error} />
        {notice ? <AuthFormNotice>{notice}</AuthFormNotice> : null}

        <AuthFormField id="pathwayos-register-code" label="Verification code">
          <Input
            autoComplete="one-time-code"
            id="pathwayos-register-code"
            inputMode="numeric"
            nativeInput
            onChange={(event) => setVerificationCode(event.currentTarget.value)}
            required
            value={verificationCode}
          />
        </AuthFormField>

        <AuthSubmitButton
          busyLabel="Verifying..."
          icon={<MailIcon className="size-4" />}
          isBusy={isBusy}
        >
          Verify email
        </AuthSubmitButton>

        <Button disabled={isBusy} onClick={handleResendCode} type="button" variant="outline">
          <RotateCcwIcon className="size-4" />
          Resend code
        </Button>
      </form>
    );
  }

  return (
    <form className="grid gap-4" onSubmit={handleDetailsSubmit}>
      <AuthFormError message={error} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AuthFormField id="pathwayos-register-first-name" label="First name">
          <Input
            autoComplete="given-name"
            id="pathwayos-register-first-name"
            nativeInput
            onChange={(event) => setFirstName(event.currentTarget.value)}
            value={firstName}
          />
        </AuthFormField>
        <AuthFormField id="pathwayos-register-last-name" label="Last name">
          <Input
            autoComplete="family-name"
            id="pathwayos-register-last-name"
            nativeInput
            onChange={(event) => setLastName(event.currentTarget.value)}
            value={lastName}
          />
        </AuthFormField>
      </div>

      <AuthFormField id="pathwayos-register-email" label="Email">
        <Input
          autoComplete="email"
          id="pathwayos-register-email"
          nativeInput
          onChange={(event) => setEmail(event.currentTarget.value)}
          required
          type="email"
          value={email}
        />
      </AuthFormField>

      <AuthFormField id="pathwayos-register-password" label="Password">
        <PasswordInput
          autoComplete="new-password"
          id="pathwayos-register-password"
          onChange={(event) => setPassword(event.currentTarget.value)}
          required
          value={password}
        />
      </AuthFormField>

      <AuthFormField id="pathwayos-register-confirm-password" label="Confirm password">
        <PasswordInput
          autoComplete="new-password"
          id="pathwayos-register-confirm-password"
          onChange={(event) => setConfirmPassword(event.currentTarget.value)}
          required
          value={confirmPassword}
        />
      </AuthFormField>

      <AuthSubmitButton
        busyLabel="Creating account..."
        icon={<UserPlusIcon className="size-4" />}
        isBusy={isBusy}
      >
        Create account
      </AuthSubmitButton>
    </form>
  );
}

type ResetPasswordStep = "email" | "code";

export function PathwayOSForgotPasswordForm() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const navigate = useNavigate();
  const [step, setStep] = useState<ResetPasswordStep>("email");
  const [email, setEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<AuthFormStatus>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isBusy = !isLoaded || status === "submitting";

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded) {
      return;
    }

    setError(null);
    setNotice(null);
    setStatus("submitting");
    try {
      await signIn.create({
        identifier: email.trim(),
        strategy: "reset_password_email_code",
      });
      setStep("code");
      setNotice(`We sent a reset code to ${email.trim()}.`);
    } catch (cause) {
      setError(getClerkAuthErrorMessage(cause));
    } finally {
      setStatus("idle");
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded) {
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError(null);
    setStatus("submitting");
    try {
      let result = await signIn.attemptFirstFactor({
        code: verificationCode.trim(),
        password,
        strategy: "reset_password_email_code",
      });

      if (result.status === "needs_new_password") {
        result = await signIn.resetPassword({ password });
      }

      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        const pendingInvitationPath = consumePendingInvitation();
        if (pendingInvitationPath) {
          const token = new URL(pendingInvitationPath, window.location.origin).searchParams.get(
            "token",
          );
          if (token) {
            void navigate({ to: "/invitations/accept", search: { token }, replace: true });
            return;
          }
        }
        void navigate({ to: AUTH_COMPLETE_ROUTE, replace: true });
        return;
      }

      setError(getUnsupportedSignInStatusMessage(result.status));
    } catch (cause) {
      setError(getClerkAuthErrorMessage(cause));
    } finally {
      setStatus("idle");
    }
  }

  if (step === "code") {
    return (
      <form className="grid gap-4" onSubmit={handlePasswordSubmit}>
        <AuthFormError message={error} />
        {notice ? <AuthFormNotice>{notice}</AuthFormNotice> : null}

        <AuthFormField id="pathwayos-reset-code" label="Reset code">
          <Input
            autoComplete="one-time-code"
            id="pathwayos-reset-code"
            inputMode="numeric"
            nativeInput
            onChange={(event) => setVerificationCode(event.currentTarget.value)}
            required
            value={verificationCode}
          />
        </AuthFormField>

        <AuthFormField id="pathwayos-reset-password" label="New password">
          <PasswordInput
            autoComplete="new-password"
            id="pathwayos-reset-password"
            onChange={(event) => setPassword(event.currentTarget.value)}
            required
            value={password}
          />
        </AuthFormField>

        <AuthFormField id="pathwayos-reset-confirm-password" label="Confirm password">
          <PasswordInput
            autoComplete="new-password"
            id="pathwayos-reset-confirm-password"
            onChange={(event) => setConfirmPassword(event.currentTarget.value)}
            required
            value={confirmPassword}
          />
        </AuthFormField>

        <AuthSubmitButton
          busyLabel="Resetting..."
          icon={<KeyRoundIcon className="size-4" />}
          isBusy={isBusy}
        >
          Reset password
        </AuthSubmitButton>

        <Button
          disabled={isBusy}
          onClick={() => {
            setStep("email");
            setError(null);
            setNotice(null);
          }}
          type="button"
          variant="outline"
        >
          Use a different email
        </Button>
      </form>
    );
  }

  return (
    <form className="grid gap-4" onSubmit={handleEmailSubmit}>
      <AuthFormError message={error} />

      <AuthFormField id="pathwayos-reset-email" label="Email">
        <Input
          autoComplete="email"
          id="pathwayos-reset-email"
          nativeInput
          onChange={(event) => setEmail(event.currentTarget.value)}
          required
          type="email"
          value={email}
        />
      </AuthFormField>

      <AuthSubmitButton
        busyLabel="Sending code..."
        icon={<MailIcon className="size-4" />}
        isBusy={isBusy}
      >
        Send reset code
      </AuthSubmitButton>
    </form>
  );
}
