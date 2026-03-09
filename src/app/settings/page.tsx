"use client";

import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { Loader2Icon } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/convex";
import { cn } from "@/lib/utils";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function SurfaceCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-4xl border-2 border-foreground/10 bg-card/85 p-6 shadow-xl shadow-primary/10 backdrop-blur-sm sm:p-8",
        className,
      )}
    >
      {children}
    </section>
  );
}

function SettingsInput({ className, ...props }: React.ComponentProps<"input">) {
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

function SignedOutSettings() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl items-center px-4 py-10 sm:px-6 lg:px-8">
      <SurfaceCard className="w-full">
        <Badge className="rounded-full border border-foreground/15 bg-background/75 px-3 py-1 font-mono text-[0.7rem] tracking-[0.24em] text-foreground/70 uppercase hover:bg-background/75">
          Settings access
        </Badge>
        <h1 className="mt-5 font-display text-5xl leading-none text-foreground">
          Sign in before you manage account settings.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-foreground/80 sm:text-lg sm:leading-8">
          Username and email controls are only available inside an authenticated
          account session.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild className="rounded-full px-6">
            <Link href="/auth">Open auth</Link>
          </Button>
          <Button asChild className="rounded-full px-6" variant="outline">
            <Link href="/">Back home</Link>
          </Button>
        </div>
      </SurfaceCard>
    </main>
  );
}

function SettingsLoading() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl items-center px-4 py-10 sm:px-6 lg:px-8">
      <SurfaceCard className="w-full text-center">
        <Loader2Icon className="mx-auto size-6 animate-spin text-primary" />
        <h1 className="mt-5 font-display text-4xl leading-none text-foreground">
          Loading account settings...
        </h1>
        <p className="mt-3 text-sm leading-6 text-foreground/70 sm:text-base">
          Pulling your current profile and account state from Convex.
        </p>
      </SurfaceCard>
    </main>
  );
}

export default function SettingsPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const viewer = useQuery(api.users.viewer, isAuthenticated ? {} : "skip");
  const updateUsername = useMutation(api.users.updateUsername);
  const changeEmail = useAction(api.users.changeEmail);

  const [usernameDraft, setUsernameDraft] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [pendingAction, setPendingAction] = useState<
    "username" | "email" | null
  >(null);
  const [usernameMessage, setUsernameMessage] = useState<string | null>(null);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    if (!viewer) {
      return;
    }

    setUsernameDraft(viewer.username);
    setEmailDraft(viewer.email ?? "");
  }, [viewer]);

  async function handleUsernameSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!viewer || pendingAction) {
      return;
    }

    const nextUsername = usernameDraft.trim();
    if (nextUsername.length < 2) {
      setUsernameError("Usernames must be at least 2 characters long.");
      setUsernameMessage(null);
      return;
    }

    setPendingAction("username");
    setUsernameError(null);
    setUsernameMessage(null);

    try {
      await updateUsername({ username: nextUsername });
      setUsernameMessage("Username updated.");
    } catch (error) {
      setUsernameError(
        error instanceof Error
          ? error.message
          : "Could not update your username.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  async function handleEmailSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!viewer || pendingAction) {
      return;
    }

    const nextEmail = emailDraft.trim();
    if (!EMAIL_PATTERN.test(nextEmail)) {
      setEmailError("Enter a valid email address.");
      setEmailMessage(null);
      return;
    }

    if (!currentPassword.trim()) {
      setEmailError("Enter your current password to confirm the change.");
      setEmailMessage(null);
      return;
    }

    setPendingAction("email");
    setEmailError(null);
    setEmailMessage(null);

    try {
      await changeEmail({ currentPassword, newEmail: nextEmail });
      setCurrentPassword("");
      setEmailMessage(
        "Email updated. Use the new address the next time you sign in.",
      );
    } catch (error) {
      setEmailError(
        error instanceof Error ? error.message : "Could not update your email.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  if (isLoading) {
    return <SettingsLoading />;
  }

  if (!isAuthenticated) {
    return <SignedOutSettings />;
  }

  if (viewer === undefined) {
    return <SettingsLoading />;
  }

  if (viewer.authType === "anonymous") {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-col px-4 py-10 sm:px-6 lg:px-8">
        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start lg:gap-8">
          <SurfaceCard>
            <Badge className="rounded-full border border-foreground/15 bg-background/75 px-3 py-1 font-mono text-[0.7rem] tracking-[0.24em] text-foreground/70 uppercase hover:bg-background/75">
              Guest settings
            </Badge>
            <h1 className="mt-5 font-display text-5xl leading-none text-foreground">
              Upgrade before you edit saved account details.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-foreground/85 sm:text-lg sm:leading-8">
              Guest sessions are great for quick participation, but they do not
              support saved username or email management from settings.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild className="rounded-full px-6">
                <Link href="/auth">Create email + password account</Link>
              </Button>
              <Button asChild className="rounded-full px-6" variant="outline">
                <Link href="/lobby">Back to lobby hub</Link>
              </Button>
            </div>
          </SurfaceCard>

          <SurfaceCard className="space-y-4">
            <p className="font-mono text-[0.7rem] tracking-[0.24em] text-foreground/60 uppercase">
              Current session
            </p>
            <div className="rounded-3xl border border-foreground/10 bg-background/70 p-4">
              <p className="text-sm font-medium text-foreground/75">
                Display name
              </p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {viewer.username}
              </p>
            </div>
            <div className="rounded-3xl border border-primary/20 bg-primary/8 p-4 text-sm leading-6 text-foreground/80">
              Upgrade to an email/password account when you want durable
              hosting, email-based sign-in, and account-management controls
              here.
            </div>
          </SurfaceCard>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col px-4 py-10 sm:px-6 lg:px-8">
      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:gap-8">
        <div className="space-y-6">
          <SurfaceCard>
            <Badge className="rounded-full border border-foreground/15 bg-background/75 px-3 py-1 font-mono text-[0.7rem] tracking-[0.24em] text-foreground/70 uppercase hover:bg-background/75">
              Account settings
            </Badge>
            <h1 className="mt-5 font-display text-5xl leading-none text-foreground">
              Manage your identity between lobbies.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-foreground/85 sm:text-lg sm:leading-8">
              Update the username shown around the app, then confirm your
              current password to switch the email you use for sign-in.
            </p>
          </SurfaceCard>

          <SurfaceCard>
            <h2 className="font-display text-3xl leading-none text-foreground">
              Username
            </h2>
            <p className="mt-3 text-sm leading-6 text-foreground/70">
              This name appears in the signed-in navigation and future lobby
              joins.
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleUsernameSubmit}>
              <label className="block space-y-2" htmlFor="settings-username">
                <span className="text-sm font-medium text-foreground/80">
                  Username
                </span>
                <SettingsInput
                  id="settings-username"
                  onChange={(event) => setUsernameDraft(event.target.value)}
                  placeholder="Choose your display name"
                  value={usernameDraft}
                />
              </label>

              {usernameMessage ? (
                <p className="text-sm text-chart-2">{usernameMessage}</p>
              ) : null}
              {usernameError ? (
                <p className="text-sm text-destructive">{usernameError}</p>
              ) : null}

              <Button
                className="rounded-full px-6"
                disabled={pendingAction !== null}
                type="submit"
              >
                {pendingAction === "username" ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin" />
                    Saving username...
                  </>
                ) : (
                  "Save username"
                )}
              </Button>
            </form>
          </SurfaceCard>
        </div>

        <div className="space-y-6">
          <SurfaceCard>
            <h2 className="font-display text-3xl leading-none text-foreground">
              Email sign-in
            </h2>
            <p className="mt-3 text-sm leading-6 text-foreground/70">
              Confirm your current password before switching the email tied to
              your password account.
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleEmailSubmit}>
              <label className="block space-y-2" htmlFor="settings-email">
                <span className="text-sm font-medium text-foreground/80">
                  New email
                </span>
                <SettingsInput
                  autoComplete="email"
                  id="settings-email"
                  onChange={(event) => setEmailDraft(event.target.value)}
                  placeholder="host@promptparty.dev"
                  type="email"
                  value={emailDraft}
                />
              </label>

              <label
                className="block space-y-2"
                htmlFor="settings-current-password"
              >
                <span className="text-sm font-medium text-foreground/80">
                  Current password
                </span>
                <SettingsInput
                  autoComplete="current-password"
                  id="settings-current-password"
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  placeholder="Confirm with your current password"
                  type="password"
                  value={currentPassword}
                />
              </label>

              {emailMessage ? (
                <p className="text-sm text-chart-2">{emailMessage}</p>
              ) : null}
              {emailError ? (
                <p className="text-sm text-destructive">{emailError}</p>
              ) : null}

              <Button
                className="rounded-full px-6"
                disabled={pendingAction !== null}
                type="submit"
              >
                {pendingAction === "email" ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin" />
                    Updating email...
                  </>
                ) : (
                  "Update email"
                )}
              </Button>
            </form>
          </SurfaceCard>
        </div>
      </section>
    </main>
  );
}
