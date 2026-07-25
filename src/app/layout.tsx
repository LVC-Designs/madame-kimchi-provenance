import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, Inter } from "next/font/google";

import { DemoDataBanner } from "@/components/DemoDataBanner";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

import "./globals.css";
import { Providers } from "./providers";

/** UI chrome. */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

/**
 * Product and batch narrative — the human half of a passport.
 *
 * Stands in for the brand's Cooper-style display direction. Fraunces carries
 * SOFT and WONK axes that round the terminals and swap in warmer alternates,
 * which is what makes it read like Cooper rather than a generic serif; the
 * axis values live in `globals.css`.
 *
 * `next/font` downloads and self-hosts this at build time into `.next`, which
 * Git ignores — no font file is ever committed. If Cooper Std Black web rights
 * are confirmed, swap to `next/font/local`, but check its licence before the
 * file goes anywhere near the repository.
 */
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
});

/** Hashes, addresses, timestamps, transaction ids. */
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Madame Kimchi — Batch Provenance",
    template: "%s · Madame Kimchi Provenance",
  },
  description:
    "Public, tamper-evident kimchi batch records registered by authorized verifiers on Monad Testnet.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable} ${plexMono.variable} h-full`}
    >
      <body className="flex min-h-full flex-col">
        <Providers>
          {/* Required on every screen, so it lives above the router outlet. */}
          <a href="#main" className="skip-link">
            Skip to content
          </a>
          <DemoDataBanner />
          <SiteHeader />
          <main id="main" className="flex-1">{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
