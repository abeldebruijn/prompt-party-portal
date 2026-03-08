import { Loader2Icon } from "lucide-react";
import { SurfaceCard } from "@/components/ui/surface-card";

export function LobbyHubLoading() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-10 sm:px-6 lg:px-8">
      <SurfaceCard className="w-full text-center">
        <Loader2Icon className="mx-auto size-6 animate-spin text-primary" />
        <h1 className="mt-5 font-display text-4xl leading-none text-foreground">
          Loading lobby controls...
        </h1>
        <p className="mt-3 text-sm leading-6 text-foreground/70 sm:text-base">
          Checking your account and fetching the approved games.
        </p>
      </SurfaceCard>
    </main>
  );
}
