import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import type { Metadata } from "next";
import { Baloo_2, JetBrains_Mono, Manrope } from "next/font/google";

import { SiteHeader } from "@/components/site-header";

import { ConvexClientProvider } from "./ConvexClientProvider";
import "./globals.css";

const bodyFont = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
});

const displayFont = Baloo_2({
  variable: "--font-display-base",
  subsets: ["latin"],
});

const monoFont = JetBrains_Mono({
  variable: "--font-mono-base",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Prompt Party Portal",
  description:
    "Create lobbies, join with a code, and manage your Prompt Party account.",
  appleWebApp: {
    title: "Prompt Party Portal",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${bodyFont.variable} ${displayFont.variable} ${monoFont.variable} antialiased`}
      >
        <ConvexAuthNextjsServerProvider>
          <ConvexClientProvider>
            <SiteHeader />
            {children}
          </ConvexClientProvider>
        </ConvexAuthNextjsServerProvider>
      </body>
    </html>
  );
}
