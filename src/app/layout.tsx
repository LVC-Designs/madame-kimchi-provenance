import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Newsreader } from "next/font/google";

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

/** Product and batch narrative — the human half of a passport. */
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  display: "swap",
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
      className={`${inter.variable} ${newsreader.variable} ${plexMono.variable} h-full`}
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
