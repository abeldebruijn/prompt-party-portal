"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import {
  ChevronDownIcon,
  Loader2Icon,
  LogOutIcon,
  SettingsIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/convex";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/lobby", label: "Lobby hub" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuthActions();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const viewer = useQuery(api.users.viewer, isAuthenticated ? {} : "skip");
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);

    try {
      await signOut();
      router.replace("/");
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <header className="border-b border-foreground/10 bg-background/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Link
            className="font-display text-2xl leading-none text-foreground"
            href="/"
          >
            Prompt Party Portal
          </Link>

          <nav className="hidden items-center gap-2 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                className={cn(
                  "rounded-full px-3 py-2 text-sm font-medium text-foreground/70 transition-colors hover:bg-accent hover:text-accent-foreground",
                  pathname === link.href && "bg-accent text-accent-foreground",
                )}
                href={link.href}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-foreground/65">
              <Loader2Icon className="size-4 animate-spin" />
              Checking session...
            </div>
          ) : !isAuthenticated ? (
            <Button asChild className="rounded-full px-5">
              <Link href="/auth">Open auth</Link>
            </Button>
          ) : viewer ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-3 rounded-full border border-foreground/12 bg-card/90 px-3 py-2 text-left shadow-sm transition hover:border-primary/25 hover:bg-card"
                  type="button"
                >
                  <span className="flex size-9 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-foreground">
                    {viewer.username.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden min-w-0 sm:block">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {viewer.username}
                    </span>
                    <span className="block truncate text-xs text-foreground/65">
                      {viewer.email ?? "Guest account"}
                    </span>
                  </span>
                  <ChevronDownIcon className="size-4 text-foreground/60" />
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-64 rounded-2xl">
                <DropdownMenuLabel>
                  <p className="truncate text-sm font-semibold">
                    {viewer.username}
                  </p>
                  <p className="truncate text-xs font-normal text-muted-foreground">
                    {viewer.email ?? "Guest account"}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <SettingsIcon className="size-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={isSigningOut}
                  onSelect={(event) => {
                    event.preventDefault();
                    void handleSignOut();
                  }}
                  variant="destructive"
                >
                  {isSigningOut ? (
                    <>
                      <Loader2Icon className="size-4 animate-spin" />
                      Signing out...
                    </>
                  ) : (
                    <>
                      <LogOutIcon className="size-4" />
                      Sign out
                    </>
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-2 text-sm text-foreground/65">
              <Loader2Icon className="size-4 animate-spin" />
              Loading account...
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
