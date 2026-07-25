"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { Hex } from "viem";
import { usePublicClient, useReadContract } from "wagmi";

import { AuditPanel } from "@/components/AuditPanel";
import { MonoValue } from "@/components/MonoValue";
import { PaperSheet } from "@/components/PaperSheet";
import { StatusBadge } from "@/components/StatusBadge";
import { Timeline } from "@/components/Timeline";
import {
  PROVENANCE_ADDRESS,
  ZERO_HASH,
  kimchiProvenanceAbi,
} from "@/lib/contract";
import { eventsForRecord, fetchRegistryEvents } from "@/lib/events";
import { isDemoRecord } from "@/lib/fixtures";
import { explorerAddressUrl } from "@/lib/monad";
import { formatChainTime, resolveMetadata, statusName } from "@/lib/passport";
import { isSafeHref } from "@/lib/schema";
import { useOpenRegistration } from "@/lib/useOpenRegistration";

import { PassportQr } from "./PassportQr";

/**
 * The exact claim this product makes, quoted from CLAUDE.md.
 *
 * It is reproduced verbatim rather than paraphrased. Every softening of this
 * sentence in the direction of "verified" or "certified" is a claim the system
 * cannot support, and the passport is the page most likely to be screenshotted
 * out of context.
 */
const PRODUCT_CLAIM =
  "An authorized verifier registered this exact batch record or attestation at this time; the published record has not changed; and anyone can independently check the record without trusting Madame Kimchi's private database.";

/** The three distinctions the interface is required to keep separate. */
const DISCLAIMERS = [
  {
    heading: "Registered by an authorized verifier",
    body: "A wallet holding the verifier role submitted this record. Who holds that role is a matter of trust in Madame Kimchi, not cryptography.",
  },
  {
    heading: "Cryptographically unchanged",
    body: "The published metadata still hashes to the value recorded on-chain. Any edit to any field produces a different hash.",
  },
  {
    heading: "Not independently validated for truth or food safety",
    body: "Nothing here verifies the contents of a document, the safety of a product, the validity of a certification, or that a physical jar matches this record.",
  },
] as const;

/**
 * Replaces the first distinction on an open registry.
 *
 * The other two still hold — the hash check and the absence of validation are
 * properties of the data, not of who wrote it. Only the claim about authority
 * has to go, and it has to go loudly: this page is the artefact people
 * screenshot.
 */
const OPEN_DISCLAIMERS = [
  {
    heading: "Published by an unverified wallet",
    body: "This registry accepts writes from anyone. The wallet shown registered this record, but no role was granted to it and nobody vouched for it. Treat the identity as unverified.",
  },
  DISCLAIMERS[1],
  DISCLAIMERS[2],
] as const;

interface ChainRecord {
  batchIdHash: Hex;
  supersedesRecordHash: Hex;
  supersededByRecordHash: Hex;
  issuer: Hex;
  registeredAt: bigint;
  status: number;
  metadataURI: string;
}

export function BatchPassport({ recordHash }: { recordHash: Hex }) {
  const publicClient = usePublicClient();
  const openRegistration = useOpenRegistration();
  const configured = PROVENANCE_ADDRESS !== null;

  // --- The on-chain record. No wallet involved: this is a public read. ---
  const {
    data: record,
    isLoading: recordLoading,
    error: recordError,
  } = useReadContract({
    address: PROVENANCE_ADDRESS ?? undefined,
    abi: kimchiProvenanceAbi,
    functionName: "getBatch",
    args: [recordHash],
    query: { enabled: configured, retry: false },
  });

  const chain = record as ChainRecord | undefined;

  const { data: attestationCount } = useReadContract({
    address: PROVENANCE_ADDRESS ?? undefined,
    abi: kimchiProvenanceAbi,
    functionName: "attestationCount",
    args: [recordHash],
    query: { enabled: configured && chain !== undefined },
  });

  const { data: versions } = useReadContract({
    address: PROVENANCE_ADDRESS ?? undefined,
    abi: kimchiProvenanceAbi,
    functionName: "getVersions",
    args: chain === undefined ? undefined : [chain.batchIdHash],
    query: { enabled: configured && chain !== undefined },
  });

  // --- Published metadata, re-hashed and compared client-side ------------
  const { data: resolution } = useQuery({
    queryKey: ["metadata", recordHash, chain?.metadataURI],
    enabled: chain !== undefined,
    queryFn: () => resolveMetadata(recordHash, chain?.metadataURI ?? ""),
    staleTime: 60_000,
  });

  // --- Timeline from contract events -------------------------------------
  const { data: timeline, isLoading: timelineLoading } = useQuery({
    queryKey: ["timeline", recordHash, chain?.registeredAt?.toString()],
    enabled: configured && chain !== undefined && publicClient !== undefined,
    staleTime: 30_000,
    queryFn: async () => {
      const result = await fetchRegistryEvents(publicClient!, PROVENANCE_ADDRESS!, {
        registeredAt: chain?.registeredAt,
      });
      return { ...result, events: eventsForRecord(result.events, recordHash) };
    },
  });

  // -----------------------------------------------------------------------
  if (!configured) {
    return (
      <Banner tone="alert" title="Registry not configured">
        No contract address is available, so no record can be read.
      </Banner>
    );
  }

  if (recordLoading) {
    return (
      <Banner tone="info" title="Reading Monad Testnet">
        Fetching the batch record.
      </Banner>
    );
  }

  if (recordError !== null || chain === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <Banner tone="alert" title="No such record">
          <p className="mb-3">
            Monad Testnet holds no batch record for this hash. It may never have
            been registered, or the hash may be mistyped.
          </p>
          <MonoValue tone="alert">{recordHash}</MonoValue>
        </Banner>
        <Link
          href="/trace"
          className="text-monad-400 hover:text-monad-300 font-mono text-[11px] uppercase tracking-[0.14em]"
        >
          ← Back to lookup
        </Link>
      </div>
    );
  }

  const status = statusName(Number(chain.status));
  const metadata = resolution?.metadata ?? null;
  const integrity = resolution?.integrity ?? "CHECKING";
  const superseded = chain.supersededByRecordHash !== ZERO_HASH;
  const isDemo = isDemoRecord(recordHash);

  return (
    <div className="flex flex-col gap-6">
      {/* ============================================ demonstration notice */}
      {isDemo && (
        <div className="border-paper-400 bg-paper-200 text-paper-900 rounded-sm border px-4 py-3">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em]">
            Demo data — not a commercial batch
          </p>
          <p className="text-paper-700 mt-1 text-[12px] leading-relaxed">
            Every value in this record is fictional. It exists to demonstrate the
            provenance prototype and carries no commercial or regulatory standing.
          </p>
        </div>
      )}

      {openRegistration && (
        <Banner tone="alert" title="Open sandbox registry">
          Anyone can write to this registry, so a record here shows only that
          some wallet published it — not that an authorised verifier did. The
          integrity guarantees are unchanged; the identity claim is not.
        </Banner>
      )}

      {/* ============================================ lifecycle banners */}
      {status === "RECALLED" && (
        <Banner tone="alert" title="Recalled">
          An authorized verifier recorded a recall against this batch. A recall
          is permanent and cannot be withdrawn; any correction is appended
          alongside it and leaves the recall visible.
        </Banner>
      )}

      {status === "QUARANTINED" && (
        <Banner tone="alert" title="Quarantined">
          This batch is held pending investigation. It may later be released or
          recalled, and either outcome will appear in the timeline below.
        </Banner>
      )}

      {superseded && (
        <Banner tone="info" title="Superseded">
          <p className="mb-3">
            A newer version of this record has been published. This record
            remains readable and unchanged — corrections never overwrite.
          </p>
          <Link
            href={`/trace/${chain.supersededByRecordHash}`}
            className="text-monad-400 hover:text-monad-300 font-mono text-[11px] break-all"
          >
            Open the current version → {chain.supersededByRecordHash}
          </Link>
        </Banner>
      )}

      {/* ============================================ integrity strip */}
      <IntegrityStrip
        integrity={integrity}
        reason={resolution?.reason ?? null}
        source={resolution?.source ?? "none"}
        computedHash={resolution?.computedHash ?? null}
        recordHash={recordHash}
      />

      {/* ============================================ main columns */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-6">
          {/* ------------------------------------------- product narrative */}
          <PaperSheet eyebrow="Batch record">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-paper-700 font-mono text-[11px] uppercase tracking-[0.16em]">
                  Product
                </p>
                <h2 className="mt-1 font-serif text-3xl leading-tight">
                  {metadata?.productName ?? "Metadata not published"}
                </h2>
              </div>
              <StatusBadge status={status} />
            </div>

            {metadata !== null ? (
              <>
                <dl className="border-paper-300/70 mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-t pt-6 sm:grid-cols-3">
                  <PaperField label="Batch ID" value={metadata.batchId} mono />
                  <PaperField label="Lot number" value={metadata.lotNumber} mono />
                  <PaperField label="SKU" value={metadata.productSku} mono />
                  <PaperField label="Produced" value={metadata.productionDate} mono />
                  <PaperField label="Packed" value={metadata.packedDate} mono />
                  <PaperField label="Best before" value={metadata.bestBeforeDate} mono />
                  <PaperField
                    label="Fermentation start"
                    value={metadata.fermentationStart}
                    mono
                  />
                  <PaperField
                    label="Fermentation end"
                    value={metadata.fermentationEnd ?? "Still fermenting"}
                    mono
                  />
                  <PaperField
                    label="Facility"
                    value={metadata.facilityName ?? "Not published"}
                  />
                </dl>

                {metadata.ingredientOrigins.length > 0 && (
                  <div className="border-paper-300/70 mt-6 border-t pt-6">
                    <p className="text-paper-700 font-mono text-[11px] uppercase tracking-[0.16em]">
                      Ingredient origins
                    </p>
                    <ul className="mt-3 flex flex-col gap-2.5">
                      {metadata.ingredientOrigins.map((origin, index) => (
                        <li key={index} className="text-[13px] leading-relaxed">
                          <span className="font-serif text-[15px]">
                            {origin.ingredient}
                          </span>
                          <span className="text-paper-700">
                            {" "}
                            — {origin.originRegion}, {origin.originCountry}
                          </span>
                          {origin.note !== null && (
                            <span className="text-paper-700 block text-[12px] italic">
                              {origin.note}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {metadata.certificationReferences.length > 0 && (
                  <div className="border-paper-300/70 mt-6 border-t pt-6">
                    <p className="text-paper-700 font-mono text-[11px] uppercase tracking-[0.16em]">
                      Certification references
                    </p>
                    <p className="text-paper-700 mt-1 text-[11px] leading-relaxed">
                      Referenced, not validated. Listing a certification is not a
                      claim that it is valid, current, or applicable.
                    </p>
                    <ul className="mt-3 flex flex-col gap-2">
                      {metadata.certificationReferences.map((certification, index) => (
                        <li key={index} className="text-[13px] leading-relaxed">
                          <span className="font-serif text-[15px]">
                            {certification.label}
                          </span>
                          <span className="text-paper-700">
                            {" "}
                            — {certification.issuer}
                          </span>
                          <code className="text-paper-700 block font-mono text-[11px]">
                            {certification.identifier}
                          </code>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {metadata.documentReferences.length > 0 && (
                  <div className="border-paper-300/70 mt-6 border-t pt-6">
                    <p className="text-paper-700 font-mono text-[11px] uppercase tracking-[0.16em]">
                      Referenced documents
                    </p>
                    <p className="text-paper-700 mt-1 text-[11px] leading-relaxed">
                      Documents are never stored on-chain. Only these digests are
                      published.
                    </p>
                    <ul className="mt-3 flex flex-col gap-3">
                      {metadata.documentReferences.map((document, index) => (
                        <li key={index}>
                          <p className="text-[13px]">
                            <span className="font-serif text-[15px]">
                              {document.label}
                            </span>
                            <span className="text-paper-700">
                              {" "}
                              · {document.documentType}
                            </span>
                          </p>
                          <code className="text-paper-700 block font-mono text-[11px] break-all">
                            sha256 {document.sha256}
                          </code>
                          {document.uri !== null && isSafeHref(document.uri) && (
                            <a
                              href={document.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-paper-800 font-mono text-[11px] underline"
                            >
                              Open document ↗
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {metadata.notes !== null && (
                  <div className="border-paper-300/70 mt-6 border-t pt-6">
                    <p className="text-paper-700 font-mono text-[11px] uppercase tracking-[0.16em]">
                      Notes
                    </p>
                    <p className="text-paper-900 mt-2 text-[13px] leading-relaxed">
                      {metadata.notes}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-paper-700 border-paper-300/70 mt-6 border-t pt-6 text-[13px] leading-relaxed">
                The on-chain record exists and is shown to the right, but no
                readable public document is available for it, so no product
                detail can be displayed.
              </p>
            )}
          </PaperSheet>

          {/* ------------------------------------------- timeline */}
          <AuditPanel
            title="Fermentation and chain of custody"
            meta={
              <span className="tabular font-mono text-[11px]">
                {attestationCount === undefined
                  ? "—"
                  : `${Number(attestationCount)} attestation${Number(attestationCount) === 1 ? "" : "s"}`}
              </span>
            }
          >
            {timelineLoading ? (
              <p className="text-ink-400 text-[13px]">Reading contract events…</p>
            ) : (
              <Timeline
                events={timeline?.events ?? []}
                incomplete={timeline !== undefined && !timeline.range.complete}
                scannedFrom={timeline?.range.fromBlock ?? 0n}
                scannedTo={timeline?.range.toBlock ?? 0n}
              />
            )}
          </AuditPanel>
        </div>

        {/* --------------------------------------------- verification rail */}
        <div className="flex flex-col gap-4">
          <AuditPanel title="On-chain record" tone="crypto">
            <div className="flex flex-col gap-4">
              <RailField label="Record hash" value={recordHash} tone="crypto" />
              <RailField label="Batch ID hash" value={chain.batchIdHash} tone="crypto" />
              <RailField
                label="Registered by"
                value={chain.issuer}
                href={explorerAddressUrl(chain.issuer)}
              />
              <RailField
                label="Registered at"
                value={formatChainTime(chain.registeredAt)}
              />
              <RailField label="Status" value={status} />
              {/*
                metadataURI is an arbitrary string chosen by whoever registered
                the record — the contract accepts any bytes and the metadata
                schema never sees it. It is only ever made clickable when it is
                an http(s) URL.
              */}
              <RailField
                label="Metadata URI"
                value={chain.metadataURI === "" ? "Not published" : chain.metadataURI}
                href={isSafeHref(chain.metadataURI) ? chain.metadataURI : undefined}
              />
              <RailField
                label="Supersedes"
                value={
                  chain.supersedesRecordHash === ZERO_HASH
                    ? "Original record"
                    : chain.supersedesRecordHash
                }
                href={
                  chain.supersedesRecordHash === ZERO_HASH
                    ? undefined
                    : `/trace/${chain.supersedesRecordHash}`
                }
              />
              <RailField
                label="Superseded by"
                value={superseded ? chain.supersededByRecordHash : "This is current"}
                href={
                  superseded ? `/trace/${chain.supersededByRecordHash}` : undefined
                }
              />
              <RailField
                label="Registry contract"
                value={PROVENANCE_ADDRESS ?? ""}
                href={explorerAddressUrl(PROVENANCE_ADDRESS ?? "")}
                tone="crypto"
              />
            </div>
          </AuditPanel>

          {Array.isArray(versions) && versions.length > 1 && (
            <AuditPanel title="Version history">
              <ol className="flex flex-col gap-2">
                {(versions as Hex[]).map((version, index) => {
                  const current = version.toLowerCase() === recordHash.toLowerCase();
                  return (
                    <li key={version} className="flex items-start gap-3">
                      <span className="text-ink-400 tabular mt-[3px] font-mono text-[11px]">
                        v{index + 1}
                      </span>
                      {current ? (
                        <span className="text-paper-100 font-mono text-[11px] break-all">
                          {version} — viewing
                        </span>
                      ) : (
                        <Link
                          href={`/trace/${version}`}
                          className="text-monad-400 hover:text-monad-300 font-mono text-[11px] break-all"
                        >
                          {version}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ol>
            </AuditPanel>
          )}

          <AuditPanel title="Batch Passport QR">
            <PassportQr recordHash={recordHash} />
          </AuditPanel>

          {/* --------------------------------------- the exact disclaimer */}
          <AuditPanel title="What this establishes">
            <blockquote className="border-monad-600 text-ink-200 border-l-2 pl-4 font-serif text-[15px] leading-relaxed italic">
              {PRODUCT_CLAIM}
            </blockquote>

            <dl className="border-ink-800 mt-5 flex flex-col gap-4 border-t pt-5">
              {(openRegistration ? OPEN_DISCLAIMERS : DISCLAIMERS).map((claim) => (
                <div key={claim.heading}>
                  <dt className="text-ink-200 font-serif text-[14px] leading-snug">
                    {claim.heading}
                  </dt>
                  <dd className="text-ink-400 mt-1 text-[12px] leading-relaxed">
                    {claim.body}
                  </dd>
                </div>
              ))}
            </dl>
          </AuditPanel>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function IntegrityStrip({
  integrity,
  reason,
  source,
  computedHash,
  recordHash,
}: {
  integrity: string;
  reason: string | null;
  source: string;
  computedHash: string | null;
  recordHash: string;
}) {
  const states = {
    CHECKING: {
      frame: "border-ink-700 bg-ink-900",
      label: "text-ink-300",
      title: "Checking the published record",
      body: "Re-computing the canonical hash in your browser.",
    },
    HASH_VERIFIED: {
      frame: "border-monad-600/60 bg-monad-950/40",
      label: "text-monad-200",
      title: "Registered · Hash verified",
      body: `The published document hashes to exactly the value registered on Monad Testnet, so it has not changed since registration. Verified ${source === "bundled" ? "against the document bundled with this application" : "against the published metadata URI"}, in your browser. This says nothing about whether its contents are true.`,
    },
    MODIFIED: {
      frame: "border-alert-500 bg-alert-950",
      label: "text-alert-200",
      title: "Registered · MODIFIED",
      body: "The published document does not hash to the value registered on Monad Testnet. It has been changed since registration, or it is not the document that was registered.",
    },
    METADATA_UNAVAILABLE: {
      frame: "border-ink-600 bg-ink-850",
      label: "text-ink-200",
      title: "Registered · Metadata unavailable",
      body: "The on-chain record exists, but no readable published document could be loaded, so nothing can be compared against it.",
    },
  } as const;

  const state = states[integrity as keyof typeof states] ?? states.CHECKING;

  return (
    <div className={`rounded-sm border px-5 py-4 ${state.frame}`}>
      <p
        className={`font-mono text-[12px] font-semibold uppercase tracking-[0.18em] ${state.label}`}
      >
        {state.title}
      </p>
      <p className="text-ink-300 mt-2 max-w-3xl text-[13px] leading-relaxed">
        {reason ?? state.body}
      </p>

      {integrity === "MODIFIED" && computedHash !== null && (
        <dl className="border-alert-600/40 mt-4 grid gap-2 border-t pt-4">
          <div>
            <dt className="text-alert-300 font-mono text-[11px] uppercase tracking-[0.14em]">
              Registered on Monad
            </dt>
            <dd>
              <MonoValue tone="crypto">{recordHash}</MonoValue>
            </dd>
          </div>
          <div>
            <dt className="text-alert-300 font-mono text-[11px] uppercase tracking-[0.14em]">
              Computed from the published document
            </dt>
            <dd>
              <MonoValue tone="alert">{computedHash}</MonoValue>
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}

function Banner({
  tone,
  title,
  children,
}: {
  tone: "info" | "alert";
  title: string;
  children: React.ReactNode;
}) {
  const tones = {
    info: "border-ink-700 bg-ink-900 text-ink-300",
    alert: "border-alert-600 bg-alert-950 text-alert-200",
  } as const;

  return (
    <div className={`rounded-sm border px-5 py-4 ${tones[tone]}`}>
      <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.18em]">
        {title}
      </p>
      <div className="mt-2 text-[13px] leading-relaxed">{children}</div>
    </div>
  );
}

function PaperField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-paper-700 font-mono text-[11px] uppercase tracking-[0.16em]">
        {label}
      </dt>
      <dd
        className={`text-paper-900 mt-1 text-[13px] ${mono ? "tabular font-mono" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function RailField({
  label,
  value,
  href,
  tone = "default",
}: {
  label: string;
  value: string;
  href?: string;
  tone?: "default" | "crypto";
}) {
  const external = href !== undefined && href.startsWith("http");

  return (
    <div className="flex flex-col gap-1">
      <span className="text-ink-400 font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">
        {label}
      </span>
      {href === undefined ? (
        <MonoValue tone={tone}>{value}</MonoValue>
      ) : external ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-monad-400 hover:text-monad-300 font-mono text-[13px] break-all transition-colors"
        >
          {value} ↗
        </a>
      ) : (
        <Link
          href={href}
          className="text-monad-400 hover:text-monad-300 font-mono text-[13px] break-all transition-colors"
        >
          {value}
        </Link>
      )}
    </div>
  );
}
