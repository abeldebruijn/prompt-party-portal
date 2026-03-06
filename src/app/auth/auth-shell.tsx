"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import type * as React from "react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { cn } from "@/lib/utils";

const authModes = [
  { label: "Log in", value: "login" },
  { label: "Register", value: "register" },
] as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

type AuthMode = (typeof authModes)[number]["value"];
type PendingAction = "password" | "guest" | null;

type AuthFields = {
  email: string;
  password: string;
  passwordConfirmation: string;
};

type FieldErrors = Partial<Record<keyof AuthFields, string>>;

function validateAuthFields(mode: AuthMode, fields: AuthFields): FieldErrors {
  const errors: FieldErrors = {};
  const email = fields.email.trim();

  if (!email) {
    errors.email = "Enter your email address.";
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = "Enter a valid email address.";
  }

  if (!fields.password) {
    errors.password =
      mode === "register" ? "Create a password." : "Enter your password.";
  } else if (
    mode === "register" &&
    fields.password.length < MIN_PASSWORD_LENGTH
  ) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (mode === "register") {
    if (!fields.passwordConfirmation) {
      errors.passwordConfirmation = "Repeat your password.";
    } else if (fields.password !== fields.passwordConfirmation) {
      errors.passwordConfirmation = "Passwords do not match.";
    }
  }

  return errors;
}

function getAuthErrorMessage(error: unknown, mode: AuthMode): string {
  if (error instanceof Error) {
    if (error.message === "Invalid credentials") {
      return "We couldn't match that email/password combination.";
    }

    if (error.message === "Invalid password") {
      return mode === "register"
        ? `Passwords must be at least ${MIN_PASSWORD_LENGTH} characters.`
        : "That password does not meet the current requirements.";
    }

    if (error.message.includes("already exists")) {
      return "That email already has an account. Log in instead or use a different email.";
    }

    if (error.message.includes("not configured")) {
      return "This sign-in method is not available right now.";
    }

    if (error.message.trim()) {
      return error.message;
    }
  }

  return "Something went wrong while trying to authenticate. Please try again.";
}

function AuthInput({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-2xl border border-foreground/12 bg-background/80 px-4 text-sm text-foreground shadow-sm outline-none transition focus:border-primary/40 focus:ring-4 focus:ring-primary/10",
        "placeholder:text-foreground/45 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

export function AuthShell() {
  const router = useRouter();
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [fields, setFields] = useState<AuthFields>({
    email: "",
    password: "",
    passwordConfirmation: "",
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const isRegister = mode === "register";
  const isBusy = pendingAction !== null;
  const isRedirecting = isBusy || (isAuthenticated && !isLoading);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated, isLoading, router]);

  function setFieldValue(field: keyof AuthFields, value: string) {
    setFields((currentFields) => ({
      ...currentFields,
      [field]: value,
    }));
    setFieldErrors((currentErrors) => ({
      ...currentErrors,
      [field]: undefined,
    }));
    setFormError(null);
  }

  function handleModeChange(nextMode: AuthMode) {
    if (isBusy) {
      return;
    }

    setMode(nextMode);
    setFieldErrors({});
    setFormError(null);

    if (nextMode === "login") {
      setFields((currentFields) => ({
        ...currentFields,
        passwordConfirmation: "",
      }));
    }
  }

  async function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isBusy) {
      return;
    }

    const validationErrors = validateAuthFields(mode, fields);

    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      setFormError(null);
      return;
    }

    setPendingAction("password");
    setFieldErrors({});
    setFormError(null);

    try {
      const result = await signIn("password", {
        email: fields.email.trim(),
        password: fields.password,
        flow: isRegister ? "signUp" : "signIn",
        redirectTo: "/",
      });

      if (!result.signingIn) {
        setPendingAction(null);
        setFormError(
          "Additional verification is required before this account can continue.",
        );
        return;
      }

      router.replace("/");
    } catch (error) {
      setPendingAction(null);
      setFormError(getAuthErrorMessage(error, mode));
    }
  }

  async function handleGuestSignIn() {
    if (isBusy) {
      return;
    }

    setPendingAction("guest");
    setFieldErrors({});
    setFormError(null);

    try {
      const result = await signIn("anonymous", {
        redirectTo: "/",
      });

      if (!result.signingIn) {
        setPendingAction(null);
        setFormError(
          "Additional verification is required before this guest account can continue.",
        );
        return;
      }

      router.replace("/");
    } catch (error) {
      setPendingAction(null);
      setFormError(getAuthErrorMessage(error, mode));
    }
  }

  const formStatusMessage = isRedirecting
    ? pendingAction === "guest"
      ? "Starting your guest account and sending you back to the homepage..."
      : isRegister
        ? "Creating your host account and sending you back to the homepage..."
        : "Signing you in and sending you back to the homepage..."
    : "";

  return (
    <aside className="rounded-4xl border-2 border-foreground/10 bg-card/85 p-6 shadow-xl shadow-primary/10 backdrop-blur-sm sm:p-8 lg:sticky lg:top-8">
      <Badge className="rounded-full border border-foreground/15 bg-background/75 px-3 py-1 font-mono text-[0.7rem] tracking-[0.24em] text-foreground/70 uppercase hover:bg-background/75">
        Access portal
      </Badge>

      <div className="mt-5 space-y-3">
        <h2 className="font-display text-4xl leading-none text-foreground">
          {isRegister ? "Create a host account." : "Welcome back to the lobby."}
        </h2>
        <p className="text-sm leading-6 text-foreground/75 sm:text-base">
          {isRegister
            ? "Set up an email/password account when you want a durable host identity and predictable billing ownership."
            : "Sign in with your email/password to manage returning lobbies, billing, and saved host access."}
        </p>
      </div>

      <div className="mt-6 rounded-full border border-foreground/12 bg-background/70 p-1">
        <div className="grid grid-cols-2 gap-1">
          {authModes.map((authMode) => {
            const active = authMode.value === mode;

            return (
              <Button
                key={authMode.value}
                className={cn(
                  "h-10 rounded-full text-sm font-semibold shadow-none",
                  !active &&
                    "text-foreground/70 hover:bg-background/80 hover:text-foreground",
                )}
                disabled={isBusy}
                onClick={() => handleModeChange(authMode.value)}
                type="button"
                variant={active ? "default" : "ghost"}
              >
                {authMode.label}
              </Button>
            );
          })}
        </div>
      </div>

      <form className="mt-8" onSubmit={handlePasswordSubmit}>
        <FieldGroup>
          <Field data-invalid={fieldErrors.email ? true : undefined}>
            <FieldContent>
              <FieldLabel className="text-foreground/80" htmlFor="auth-email">
                Email address
              </FieldLabel>
              <AuthInput
                autoComplete="email"
                aria-invalid={fieldErrors.email ? true : undefined}
                disabled={isBusy}
                id="auth-email"
                name="email"
                onChange={(event) => setFieldValue("email", event.target.value)}
                placeholder="host@promptparty.dev"
                type="email"
                value={fields.email}
              />
              <FieldError>{fieldErrors.email}</FieldError>
            </FieldContent>
          </Field>

          <Field data-invalid={fieldErrors.password ? true : undefined}>
            <FieldContent>
              <FieldLabel
                className="text-foreground/80"
                htmlFor="auth-password"
              >
                Password
              </FieldLabel>
              <AuthInput
                autoComplete={isRegister ? "new-password" : "current-password"}
                aria-invalid={fieldErrors.password ? true : undefined}
                disabled={isBusy}
                id="auth-password"
                name="password"
                onChange={(event) =>
                  setFieldValue("password", event.target.value)
                }
                placeholder={
                  isRegister
                    ? "Create a strong password"
                    : "Enter your password"
                }
                type="password"
                value={fields.password}
              />
              <FieldDescription>
                {isRegister
                  ? `Use at least ${MIN_PASSWORD_LENGTH} characters for your host account password.`
                  : ""}
              </FieldDescription>
              <FieldError>{fieldErrors.password}</FieldError>
            </FieldContent>
          </Field>

          {isRegister ? (
            <Field
              data-invalid={fieldErrors.passwordConfirmation ? true : undefined}
            >
              <FieldContent>
                <FieldLabel
                  className="text-foreground/80"
                  htmlFor="auth-password-confirmation"
                >
                  Confirm password
                </FieldLabel>
                <AuthInput
                  autoComplete="new-password"
                  aria-invalid={
                    fieldErrors.passwordConfirmation ? true : undefined
                  }
                  disabled={isBusy}
                  id="auth-password-confirmation"
                  name="passwordConfirmation"
                  onChange={(event) =>
                    setFieldValue("passwordConfirmation", event.target.value)
                  }
                  placeholder="Repeat your password"
                  type="password"
                  value={fields.passwordConfirmation}
                />
                <FieldError>{fieldErrors.passwordConfirmation}</FieldError>
              </FieldContent>
            </Field>
          ) : null}


          <Button
            className="h-11 w-full rounded-full text-sm font-semibold"
            disabled={isBusy}
            type="submit"
          >
            {pendingAction === "password" ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                {isRegister ? "Creating account..." : "Signing in..."}
              </>
            ) : isRegister ? (
              "Create account"
            ) : (
              "Sign in with email"
            )}
          </Button>

          <FieldDescription className="text-center text-foreground/65">
            {formStatusMessage}
          </FieldDescription>

          <FieldError className="text-center">{formError}</FieldError>

          <FieldSeparator>or</FieldSeparator>

          <div className="rounded-3xl border border-foreground/10 bg-background/70 p-4">
            <p className="font-mono text-[0.7rem] tracking-[0.22em] text-foreground/60 uppercase">
              Guest account
            </p>
            <p className="mt-2 text-sm leading-6 text-foreground/80">
              Guest users have fewer features due to platform limits, so use a
              guest account for quick participation instead of full host
              control.
            </p>
          </div>

          <Button
            className="h-11 w-full rounded-full border-2 border-foreground/12 bg-background/75 text-foreground hover:bg-accent hover:text-accent-foreground"
            disabled={isBusy}
            onClick={handleGuestSignIn}
            type="button"
            variant="outline"
          >
            {pendingAction === "guest" ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                Continuing as guest account...
              </>
            ) : (
              "Continue as guest account"
            )}
          </Button>
        </FieldGroup>
      </form>
    </aside>
  );
}
