"use client";

import Link from "next/link";

import { MonoValue } from "@/components/MonoValue";
import type { TimelineEvent } from "@/lib/events";
import { explorerTxUrl } from "@/lib/monad";
import { formatChainTime, statusName } from "@/lib/passport";
import { ATTESTATION_TYPES } from "@/lib/schema";

/** Human labels for the fixed attestation vocabulary. */
const ATTESTATION_LABELS: Record<string, string> = {
  INGREDIENT_RECEIVED: "Ingredient received",
  FERMENTATION_STARTED: "Fermentation started",
  FERMENTATION_COMPLETED: "Fermentation completed",
  QUALITY_CHECK: "Quality check",
  PACKED: "Packed",
  SHIPPED: "Shipped",
  DISTRIBUTOR_RECEIVED: "Distributor received",
  RETAILER_RECEIVED: "Retailer received",
  QUARANTINED: "Quarantined",
  RECALLED: "Recalled",
  CORRECTION: "Correction",
};

/** Attestation types that must read as alarming rather than routine. */
const ALARMING = new Set(["QUARANTINED", "RECALLED"]);

interface Described {
  title: string;
  detail: string | null;
  alarming: boolean;
  verifier: string | null;
}

function describe(event: TimelineEvent): Described {
  switch (event.kind) {
    case "REGISTERED":
      return {
        title: "Batch record registered",
        detail: "An authorized verifier published this record to Monad Testnet.",
        alarming: false,
        verifier: (event.args.issuer as string | undefined) ?? null,
      };

    case "ATTESTATION": {
      const index = Number(event.args.attestationType ?? -1);
      const name = ATTESTATION_TYPES[index] ?? "UNKNOWN";
      return {
        title: ATTESTATION_LABELS[name] ?? name,
        detail: null,
        alarming: ALARMING.has(name),
        verifier: (event.args.verifier as string | undefined) ?? null,
      };
    }

    case "STATUS_CHANGED": {
      const from = statusName(Number(event.args.previousStatus ?? 0));
      const to = statusName(Number(event.args.newStatus ?? 0));
      return {
        title: `Status changed — ${from} to ${to}`,
        detail: null,
        alarming: to === "QUARANTINED" || to === "RECALLED",
        verifier: (event.args.verifier as string | undefined) ?? null,
      };
    }

    case "SUPERSEDED":
      return {
        title: "Superseded by a newer version",
        detail:
          "A correction was published. This record remains readable and unchanged.",
        alarming: false,
        verifier: null,
      };
  }
}

export function Timeline({
  events,
  incomplete,
  scannedFrom,
  scannedTo,
}: {
  events: TimelineEvent[];
  /** True when the log scan stopped before reaching the chain head. */
  incomplete: boolean;
  scannedFrom: bigint;
  scannedTo: bigint;
}) {
  if (events.length === 0) {
    return (
      <div className="text-ink-400 text-[13px] leading-relaxed">
        {incomplete ? (
          <>
            No events found in blocks{" "}
            <span className="tabular font-mono">{scannedFrom.toString()}</span>–
            <span className="tabular font-mono">{scannedTo.toString()}</span>. The
            scan did not reach the chain head, so events may exist outside this
            window.
          </>
        ) : (
          "No chain-of-custody attestations have been appended to this record yet."
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {incomplete && (
        <p className="border-ink-700 bg-ink-950 text-ink-400 mb-5 rounded-sm border px-3 py-2.5 text-[11px] leading-relaxed">
          Timeline may be incomplete. This RPC limits historical log queries, so
          only blocks{" "}
          <span className="tabular font-mono">{scannedFrom.toString()}</span>–
          <span className="tabular font-mono">{scannedTo.toString()}</span> were
          scanned. Point <code className="font-mono">NEXT_PUBLIC_MONAD_RPC_URL</code>{" "}
          at an endpoint without a range limit for the full history.
        </p>
      )}

      <ol className="relative flex flex-col gap-0">
        {events.map((event, index) => {
          const described = describe(event);
          const last = index === events.length - 1;

          return (
            <li
              key={`${event.transactionHash}-${event.logIndex}`}
              className="relative flex gap-4 pb-6 last:pb-0"
            >
              {/* Fermentation rail. */}
              {!last && (
                <span
                  className="bg-ink-700 absolute top-4 bottom-0 left-[5px] w-px"
                  aria-hidden
                />
              )}

              <span
                className={`relative mt-[6px] size-[11px] shrink-0 rounded-full ring-4 ${
                  described.alarming
                    ? "bg-alert-500 ring-alert-950"
                    : "bg-monad-500 ring-ink-900"
                }`}
                aria-hidden
              />

              <div className="min-w-0 flex-1">
                <p
                  className={`font-serif text-[17px] leading-snug ${
                    described.alarming ? "text-alert-200" : "text-paper-100"
                  }`}
                >
                  {described.title}
                </p>

                {described.detail !== null && (
                  <p className="text-ink-400 mt-1 text-[12px] leading-relaxed">
                    {described.detail}
                  </p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="text-ink-400 tabular font-mono text-[11px]">
                    Block {event.blockNumber.toString()}
                  </span>

                  {typeof event.args.recordedAt === "bigint" && (
                    <span className="text-ink-400 tabular font-mono text-[11px]">
                      {formatChainTime(event.args.recordedAt)}
                    </span>
                  )}
                  {typeof event.args.registeredAt === "bigint" && (
                    <span className="text-ink-400 tabular font-mono text-[11px]">
                      {formatChainTime(event.args.registeredAt)}
                    </span>
                  )}
                  {typeof event.args.changedAt === "bigint" && (
                    <span className="text-ink-400 tabular font-mono text-[11px]">
                      {formatChainTime(event.args.changedAt)}
                    </span>
                  )}

                  <a
                    href={explorerTxUrl(event.transactionHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-monad-400 hover:text-monad-300 font-mono text-[11px] transition-colors"
                  >
                    Transaction ↗
                  </a>
                </div>

                {described.verifier !== null && (
                  <p className="mt-1.5">
                    <MonoValue tone="muted">
                      Authorized verifier {described.verifier}
                    </MonoValue>
                  </p>
                )}

                {event.kind === "SUPERSEDED" &&
                  typeof event.args.newRecordHash === "string" && (
                    <Link
                      href={`/trace/${event.args.newRecordHash}`}
                      className="text-monad-400 hover:text-monad-300 mt-1.5 inline-block font-mono text-[11px] break-all transition-colors"
                    >
                      Open the superseding record →
                    </Link>
                  )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
