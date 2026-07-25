import Link from "next/link";

import { AuditPanel } from "@/components/AuditPanel";
import { MonoField } from "@/components/MonoValue";
import { PaperSheet } from "@/components/PaperSheet";
import { StatusBadge } from "@/components/StatusBadge";

/**
 * The three actions the demonstration turns on. Register is a producer action
 * on paper stock; Trace is a reader action in ink; Verify is the cryptographic
 * one and is the only card that earns Monad purple.
 */
const ACTIONS = [
  {
    href: "/admin/batches/new",
    kicker: "Authorized verifier",
    title: "Register demo batch",
    body: "Canonicalize the public batch metadata, hash it, and register the record on Monad Testnet.",
    tone: "paper",
  },
  {
    href: "/trace",
    kicker: "Anyone",
    title: "Look up batch",
    body: "Open a Batch Passport from its record hash and read the fermentation and chain-of-custody timeline.",
    tone: "ink",
  },
  {
    href: "/verify",
    kicker: "Anyone",
    title: "Verify JSON",
    body: "Hash a downloaded metadata file in your browser and compare it against the record on Monad.",
    tone: "crypto",
  },
] as const;

const STEPS = [
  {
    n: "01",
    title: "Canonicalize",
    body: "Public batch metadata is sorted, Unicode-normalized, and serialized to one exact byte sequence.",
  },
  {
    n: "02",
    title: "Register",
    body: "Its keccak256 hash, issuer, status, and timestamp are written to Monad Testnet by an authorized verifier.",
  },
  {
    n: "03",
    title: "Append",
    body: "Custody events are appended as attestations. Nothing is ever edited or removed; corrections supersede.",
  },
  {
    n: "04",
    title: "Check",
    body: "Anyone re-hashes the published file and compares. A single changed character breaks the match.",
  },
] as const;

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-5">
      {/* ---------------------------------------------------------------- */}
      <section className="grid gap-12 py-20 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-16">
        <div>
          <p className="text-ink-400 font-mono text-[11px] font-semibold uppercase tracking-[0.22em]">
            Batch Provenance Protocol · Monad Testnet
          </p>

          <h1 className="text-paper-50 mt-5 font-serif text-5xl leading-[1.05] tracking-tight sm:text-6xl">
            A public record of{" "}
            <span className="text-paper-300 italic">what was published</span>{" "}
            about a jar of kimchi.
          </h1>

          <p className="text-ink-300 mt-7 max-w-xl text-[17px] leading-relaxed">
            An authorized verifier registered this exact batch record at this
            time; the published record has not changed; and anyone can check it
            independently, without trusting Madame Kimchi&rsquo;s private
            database.
          </p>

          <p className="text-ink-400 mt-4 max-w-xl text-sm leading-relaxed">
            That is the whole claim. It is deliberately narrower than the ones
            usually made about food and blockchains — see the boundaries at the
            foot of every page.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/trace"
              className="bg-paper-100 text-ink-950 hover:bg-white rounded-sm px-5 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors"
            >
              Look up a batch
            </Link>
            <Link
              href="/verify"
              className="border-monad-600/60 text-monad-300 hover:bg-monad-950/60 hover:border-monad-500 rounded-sm border px-5 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors"
            >
              Verify a file
            </Link>
          </div>
        </div>

        {/* Specimen label — shows the paper/ink/mono system, not real data. */}
        <PaperSheet eyebrow="Specimen label">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-paper-700 font-mono text-[11px] uppercase tracking-[0.16em]">
                Batch
              </p>
              <p className="mt-1 font-serif text-2xl leading-tight">
                Original Napa Cabbage Kimchi
              </p>
            </div>
            <StatusBadge status="ACTIVE" />
          </div>

          <div className="border-paper-300/70 mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-t pt-6">
            <div>
              <p className="text-paper-700 font-mono text-[11px] uppercase tracking-[0.16em]">
                Batch ID
              </p>
              <p className="text-paper-900 tabular mt-1 font-mono text-[13px]">
                MK-DEMO-2026-001
              </p>
            </div>
            <div>
              <p className="text-paper-700 font-mono text-[11px] uppercase tracking-[0.16em]">
                Fermentation
              </p>
              <p className="text-paper-900 tabular mt-1 font-mono text-[13px]">
                14 days · 4 °C
              </p>
            </div>
          </div>

          <p className="text-paper-700 border-paper-300/70 mt-6 border-t pt-4 text-[11px] leading-relaxed">
            Illustrative layout only. No record has been registered from this
            page.
          </p>
        </PaperSheet>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section aria-labelledby="actions-heading" className="pb-6">
        <h2
          id="actions-heading"
          className="text-ink-400 font-mono text-[11px] font-semibold uppercase tracking-[0.2em]"
        >
          Start here
        </h2>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {ACTIONS.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={`group flex flex-col rounded-sm p-6 ring-1 transition-colors ${
                action.tone === "paper"
                  ? "paper-grain ring-paper-400/60 text-paper-900 hover:ring-paper-500"
                  : action.tone === "crypto"
                    ? "bg-ink-900 ring-monad-700/50 hover:bg-monad-950/40 hover:ring-monad-600"
                    : "bg-ink-900 ring-ink-700 hover:bg-ink-850 hover:ring-ink-600"
              }`}
            >
              <span
                className={`font-mono text-[11px] font-semibold uppercase tracking-[0.18em] ${
                  action.tone === "paper"
                    ? "text-paper-700"
                    : action.tone === "crypto"
                      ? "text-monad-400"
                      : "text-ink-400"
                }`}
              >
                {action.kicker}
              </span>

              <span
                className={`mt-3 font-serif text-2xl leading-tight ${
                  action.tone === "paper" ? "text-paper-900" : "text-paper-100"
                }`}
              >
                {action.title}
              </span>

              <span
                className={`mt-3 flex-1 text-[13px] leading-relaxed ${
                  action.tone === "paper" ? "text-paper-700" : "text-ink-400"
                }`}
              >
                {action.body}
              </span>

              <span
                className={`mt-6 font-mono text-[11px] uppercase tracking-[0.14em] ${
                  action.tone === "paper"
                    ? "text-paper-700 group-hover:text-paper-900"
                    : action.tone === "crypto"
                      ? "text-monad-400 group-hover:text-monad-300"
                      : "text-ink-300 group-hover:text-paper-100"
                }`}
              >
                Open →
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section aria-labelledby="how-heading" className="py-16">
        <h2
          id="how-heading"
          className="text-ink-400 font-mono text-[11px] font-semibold uppercase tracking-[0.2em]"
        >
          How a record is made
        </h2>

        <ol className="border-ink-800 mt-6 grid gap-px overflow-hidden rounded-sm border md:grid-cols-4">
          {STEPS.map((step) => (
            <li key={step.n} className="bg-ink-900 outline-ink-800 p-6 outline">
              <span className="text-monad-500 tabular font-mono text-[11px] font-semibold tracking-[0.14em]">
                {step.n}
              </span>
              <h3 className="text-paper-100 mt-3 font-serif text-xl">
                {step.title}
              </h3>
              <p className="text-ink-400 mt-2 text-[13px] leading-relaxed">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="grid gap-4 pb-16 lg:grid-cols-2">
        <AuditPanel
          title="On-chain record"
          tone="crypto"
          meta={<span className="font-mono text-[11px]">Monad Testnet</span>}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <MonoField label="Record hash" tone="crypto">
              keccak256 of canonical JSON
            </MonoField>
            <MonoField label="Issuer" tone="default">
              Authorized verifier wallet
            </MonoField>
            <MonoField label="Registered at" tone="default">
              Block timestamp
            </MonoField>
            <MonoField label="Status" tone="default">
              ACTIVE · QUARANTINED · RECALLED
            </MonoField>
          </div>
          <p className="text-ink-400 border-ink-800 mt-5 border-t pt-4 text-xs leading-relaxed">
            Only hashes, an address, a timestamp, a status, and a public URI are
            written to the chain.
          </p>
        </AuditPanel>

        <AuditPanel title="Never on-chain">
          <ul className="text-ink-300 grid gap-2.5 text-[13px] leading-relaxed">
            {[
              "Supplier documents, certificates, invoices, test reports",
              "Personal information of any kind",
              "Confidential pricing or private supplier terms",
              "Exact private facility details",
              "Keys, seed phrases, or credentials",
            ].map((item) => (
              <li key={item} className="flex gap-3">
                <span className="text-ink-400 mt-[7px] block size-1 shrink-0 rounded-full bg-current" />
                {item}
              </li>
            ))}
          </ul>
          <p className="text-ink-400 border-ink-800 mt-5 border-t pt-4 text-xs leading-relaxed">
            A document may be referenced by hash, and by public URI only where
            publication has been authorized.
          </p>
        </AuditPanel>
      </section>
    </div>
  );
}
