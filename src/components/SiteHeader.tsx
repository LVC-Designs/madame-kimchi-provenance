"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { MONAD_TESTNET_CHAIN_ID } from "@/lib/monad";

const NAV = [
  { href: "/trace", label: "Trace" },
  { href: "/verify", label: "Verify" },
  { href: "/admin/batches/new", label: "Register" },
] as const;

/**
 * Deep ink application chrome.
 *
 * The network chip is intentionally a statement of fact rather than a wallet
 * control: this phase builds the shell, and a connect button that cannot yet
 * do anything would promise capability the app does not have.
 */
export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="border-ink-800 bg-ink-950/85 sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4">
        <Link href="/" className="group flex items-baseline gap-2.5">
          <span className="font-serif text-[19px] leading-none tracking-tight text-paper-100 transition-colors group-hover:text-white">
            Madame Kimchi
          </span>
          <span className="text-ink-400 group-hover:text-ink-300 font-mono text-[11px] uppercase tracking-[0.2em] transition-colors">
            Provenance
          </span>
        </Link>

        <nav className="flex items-center gap-1" aria-label="Primary">
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-sm px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors ${
                  active
                    ? "bg-ink-800 text-paper-100"
                    : "text-ink-400 hover:bg-ink-900 hover:text-ink-200"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span className="border-ink-700 bg-ink-900 text-ink-300 inline-flex items-center gap-2 rounded-sm border px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em]">
            <span
              className="bg-monad-500 size-1.5 rounded-full"
              aria-hidden
            />
            Monad Testnet
            <span className="text-ink-400 tabular">{MONAD_TESTNET_CHAIN_ID}</span>
          </span>
        </div>
      </div>
    </header>
  );
}
