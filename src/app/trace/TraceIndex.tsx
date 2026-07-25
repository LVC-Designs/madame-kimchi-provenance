"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Hex } from "viem";
import { usePublicClient, useReadContract } from "wagmi";

import { AuditPanel } from "@/components/AuditPanel";
import { Button } from "@/components/Button";
import { MonoValue } from "@/components/MonoValue";
import { Notice } from "@/components/Notice";
import { StatusBadge } from "@/components/StatusBadge";
import { batchIdHash } from "@/lib/canonical";
import { PROVENANCE_ADDRESS, isRecordHash, kimchiProvenanceAbi } from "@/lib/contract";
import { fetchRecentRegistrations, type TimelineEvent } from "@/lib/events";
import { bundledRecordHashes } from "@/lib/fixtures";
import { explorerAddressUrl, explorerTxUrl } from "@/lib/monad";
import { formatChainTime, resolveMetadata, statusName } from "@/lib/passport";

/**
 * A record hash and a batch-id hash are both 0x + 64 hex and cannot be told
 * apart by shape. Rather than make the reader choose the right field, one input
 * accepts either and the chain decides which it is.
 */
type Resolution =
  | { kind: "idle" }
  | { kind: "invalid" }
  | { kind: "record"; recordHash: Hex }
  | { kind: "batch"; batchIdHashValue: Hex };

export function TraceIndex() {
  const router = useRouter();
  const publicClient = usePublicClient();
  const [query, setQuery] = useState("");

  const trimmed = query.trim();

  /** What the reader typed, interpreted. */
  const interpreted = useMemo<Resolution>(() => {
    if (trimmed === "") return { kind: "idle" };

    if (isRecordHash(trimmed)) {
      // Could be either; the record lookup below decides.
      return { kind: "record", recordHash: trimmed.toLowerCase() as Hex };
    }

    // A plain batch id such as MK-DEMO-2026-001.
    if (/^[A-Za-z0-9][A-Za-z0-9-]{2,63}$/.test(trimmed)) {
      return { kind: "batch", batchIdHashValue: batchIdHash(trimmed.toUpperCase()) };
    }

    return { kind: "invalid" };
  }, [trimmed]);

  const searchHash =
    interpreted.kind === "record"
      ? interpreted.recordHash
      : interpreted.kind === "batch"
        ? interpreted.batchIdHashValue
        : null;

  // Is it a record hash?
  const { data: isRecord, isLoading: recordLoading } = useReadContract({
    address: PROVENANCE_ADDRESS ?? undefined,
    abi: kimchiProvenanceAbi,
    functionName: "exists",
    args: searchHash === null ? undefined : [searchHash],
    query: { enabled: PROVENANCE_ADDRESS !== null && searchHash !== null },
  });

  // Or a batch-id hash?
  const { data: batchVersions, isLoading: versionsLoading } = useReadContract({
    address: PROVENANCE_ADDRESS ?? undefined,
    abi: kimchiProvenanceAbi,
    functionName: "getVersions",
    args: searchHash === null ? undefined : [searchHash],
    query: { enabled: PROVENANCE_ADDRESS !== null && searchHash !== null },
  });

  const versions = (batchVersions as Hex[] | undefined) ?? [];
  const searching = searchHash !== null && (recordLoading || versionsLoading);
  const nothingFound =
    searchHash !== null && !searching && isRecord !== true && versions.length === 0;

  // --- Recent registrations ---------------------------------------------
  const { data: recent, isLoading: recentLoading } = useQuery({
    queryKey: ["recent-registrations"],
    enabled: PROVENANCE_ADDRESS !== null && publicClient !== undefined,
    staleTime: 60_000,
    queryFn: () => fetchRecentRegistrations(publicClient!, PROVENANCE_ADDRESS!, 12),
  });

  /**
   * Records the application already knows about, listed regardless of the scan.
   *
   * The log scan walks backward from the chain head and stops after a bounded
   * number of windows. Monad produces roughly 216,000 blocks a day, so any
   * fixed window eventually falls behind a given registration and the batch
   * silently vanishes from this list — which is exactly what happened to the
   * demonstration batch. Bundled records are addressed by hash instead, so
   * they are found by a single call that cannot age out.
   */
  const rows = useMemo(() => {
    const seen = new Set<string>();
    const merged: { recordHash: Hex; event?: TimelineEvent }[] = [];

    for (const event of recent?.events ?? []) {
      const hash = String(event.args.recordHash ?? "").toLowerCase();
      if (hash === "" || seen.has(hash)) continue;
      seen.add(hash);
      merged.push({ recordHash: hash as Hex, event });
    }

    for (const hash of bundledRecordHashes()) {
      if (seen.has(hash.toLowerCase())) continue;
      seen.add(hash.toLowerCase());
      merged.push({ recordHash: hash as Hex });
    }

    return merged;
  }, [recent]);

  function submit() {
    if (isRecord === true && searchHash !== null) router.push(`/trace/${searchHash}`);
    else if (versions.length > 0) {
      const head = versions.at(-1);
      if (head !== undefined) router.push(`/trace/${head}`);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {PROVENANCE_ADDRESS === null && (
        <Notice tone="alert" title="Registry not configured">
          No contract address is available, so no records can be read.
        </Notice>
      )}

      {/* ------------------------------------------------------- lookup */}
      <AuditPanel title="Look up a batch">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-ink-400 font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">
              Record hash, batch ID hash, or batch ID
            </span>
            <div className="flex flex-wrap gap-3">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="0x… or MK-DEMO-2026-001"
                spellCheck={false}
                autoComplete="off"
                className={`bg-ink-950 text-paper-100 placeholder:text-ink-400 focus:border-monad-600 tabular min-w-0 flex-1 rounded-sm border px-3 py-2.5 font-mono text-[13px] ${
                  interpreted.kind === "invalid" ? "border-alert-600" : "border-ink-700"
                }`}
              />
              <Button
                type="submit"
                tone="primary"
                disabled={isRecord !== true && versions.length === 0}
              >
                Open passport
              </Button>
            </div>
          </label>
        </form>

        <div className="mt-4 min-h-[1.5rem]" aria-live="polite">
          {interpreted.kind === "invalid" && (
            <p className="text-alert-300 text-[12px] leading-relaxed">
              Enter a 0x-prefixed 32-byte hash, or a batch ID such as
              MK-DEMO-2026-001.
            </p>
          )}

          {searching && (
            <p className="text-ink-400 text-[12px]">Checking Monad Testnet…</p>
          )}

          {!searching && isRecord === true && searchHash !== null && (
            <p className="text-monad-300 text-[12px] leading-relaxed">
              Found a batch record.{" "}
              <Link href={`/trace/${searchHash}`} className="underline">
                Open its Batch Passport →
              </Link>
            </p>
          )}

          {!searching && isRecord !== true && versions.length > 0 && (
            <div className="text-[12px] leading-relaxed">
              <p className="text-monad-300">
                Found a batch with {versions.length} registered version
                {versions.length === 1 ? "" : "s"}.
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {versions.map((version, index) => (
                  <li key={version}>
                    <Link
                      href={`/trace/${version}`}
                      className="text-monad-400 hover:text-monad-300 font-mono text-[11px] break-all"
                    >
                      v{index + 1} · {version}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {nothingFound && (
            <p className="text-ink-400 text-[12px] leading-relaxed">
              Nothing registered under that hash or batch ID on Monad Testnet.
            </p>
          )}
        </div>
      </AuditPanel>

      {/* --------------------------------------------- recent registrations */}
      <AuditPanel
        title="Recently registered batches"
        meta={
          <span className="tabular font-mono text-[11px]">{rows.length} shown</span>
        }
      >
        {recentLoading ? (
          <p className="text-ink-400 text-[13px]">Reading contract events…</p>
        ) : rows.length === 0 ? (
          <p className="text-ink-400 text-[13px] leading-relaxed">
            No batch registrations found in the scanned range.
          </p>
        ) : (
          <>
            {recent !== undefined && !recent.range.complete && (
              <p className="border-ink-700 bg-ink-950 text-ink-400 mb-5 rounded-sm border px-3 py-2.5 text-[11px] leading-relaxed">
                This RPC limits historical log queries, so only blocks{" "}
                <span className="tabular font-mono">
                  {recent.range.fromBlock.toString()}
                </span>
                –
                <span className="tabular font-mono">
                  {recent.range.toBlock.toString()}
                </span>{" "}
                were scanned. Older registrations exist but are not listed here.
              </p>
            )}

            <ul className="flex flex-col gap-3">
              {rows.map((row) => (
                <RegistrationRow
                  key={row.recordHash}
                  recordHash={row.recordHash}
                  event={row.event}
                />
              ))}
            </ul>
          </>
        )}
      </AuditPanel>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * One registered batch.
 *
 * Status, issuer, and time come straight from the event, so the row is complete
 * without any further reads. The product name is deliberately *not* shown
 * unless the published document has been loaded and its hash re-verified —
 * printing a name from an unverified document would present unchecked text as
 * though the chain vouched for it.
 */
function RegistrationRow({
  recordHash,
  event,
}: {
  recordHash: Hex;
  /** Present only when the log scan reached this registration. */
  event?: TimelineEvent;
}) {
  /*
    Status, issuer and time are read from the chain rather than taken from the
    registration event. An event records the state at registration; a batch
    quarantined or recalled since would still show ACTIVE here. The event is
    used only for the transaction link, which storage does not hold.
  */
  const { data: record, isLoading: recordLoading } = useReadContract({
    address: PROVENANCE_ADDRESS ?? undefined,
    abi: kimchiProvenanceAbi,
    functionName: "getBatch",
    args: [recordHash],
    query: { enabled: PROVENANCE_ADDRESS !== null, retry: false },
  });

  const chain = record as
    | { issuer: Hex; registeredAt: bigint; status: number; metadataURI: string }
    | undefined;

  const { data: resolution, isLoading: metadataLoading } = useQuery({
    queryKey: ["metadata", recordHash, chain?.metadataURI],
    enabled: chain !== undefined,
    staleTime: 60_000,
    retry: false,
    queryFn: () => resolveMetadata(recordHash, chain?.metadataURI ?? ""),
  });

  if (recordLoading) {
    return (
      <li className="border-ink-800 bg-ink-950/50 text-ink-400 rounded-sm border p-4 text-[13px]">
        Reading record…
      </li>
    );
  }

  if (chain === undefined) return null;

  const verified = resolution?.integrity === "HASH_VERIFIED";
  const productName = verified ? (resolution?.metadata?.productName ?? null) : null;
  const status = statusName(Number(chain.status));

  return (
    <li className="border-ink-800 bg-ink-950/50 hover:border-ink-700 rounded-sm border p-4 transition-colors">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {productName !== null ? (
            <p className="text-paper-100 font-serif text-xl leading-tight">
              {productName}
            </p>
          ) : (
            <p className="text-ink-400 font-serif text-xl leading-tight italic">
              {metadataLoading ? "Loading metadata…" : "Metadata not verified"}
            </p>
          )}
          {productName === null && !metadataLoading && (
            <p className="text-ink-400 mt-0.5 text-[11px] leading-relaxed">
              The published document could not be loaded and re-hashed, so no
              product name is shown for this record.
            </p>
          )}
        </div>
        <StatusBadge status={status} />
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-ink-400 font-mono text-[11px] uppercase tracking-[0.14em]">
            Record hash
          </dt>
          <dd className="mt-0.5">
            <MonoValue tone="crypto">{recordHash}</MonoValue>
          </dd>
        </div>
        <div>
          <dt className="text-ink-400 font-mono text-[11px] uppercase tracking-[0.14em]">
            Registered
          </dt>
          <dd className="text-ink-300 tabular mt-0.5 font-mono text-[12px]">
            {formatChainTime(chain.registeredAt)}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-ink-400 font-mono text-[11px] uppercase tracking-[0.14em]">
            Registered by
          </dt>
          <dd className="mt-0.5">
            <a
              href={explorerAddressUrl(chain.issuer)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-monad-400 hover:text-monad-300 font-mono text-[12px] break-all"
            >
              {chain.issuer} ↗
            </a>
          </dd>
        </div>
      </dl>

      <div className="border-ink-800 mt-4 flex flex-wrap gap-4 border-t pt-3">
        <Link
          href={`/trace/${recordHash}`}
          className="text-paper-100 hover:text-white font-mono text-[11px] uppercase tracking-[0.14em]"
        >
          Batch Passport →
        </Link>
        <a
          href={
            event === undefined
              ? explorerAddressUrl(PROVENANCE_ADDRESS ?? "")
              : explorerTxUrl(event.transactionHash)
          }
          target="_blank"
          rel="noopener noreferrer"
          className="text-monad-400 hover:text-monad-300 font-mono text-[11px] uppercase tracking-[0.14em]"
        >
          {event === undefined ? "Registry on MonadScan ↗" : "MonadScan ↗"}
        </a>
      </div>
    </li>
  );
}
