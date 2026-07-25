"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { Hex } from "viem";
import { useReadContract } from "wagmi";

import { AuditPanel } from "@/components/AuditPanel";
import { Button } from "@/components/Button";
import { MonoValue } from "@/components/MonoValue";
import { Notice } from "@/components/Notice";
import { PROVENANCE_ADDRESS, ZERO_HASH, isRecordHash, kimchiProvenanceAbi } from "@/lib/contract";
import { diffMetadata } from "@/lib/diff";
import { explorerAddressUrl } from "@/lib/monad";
import { resolveMetadata, statusName } from "@/lib/passport";
import {
  OUTCOME_COPY,
  decideOutcome,
  readCandidate,
  type VerificationOutcome,
} from "@/lib/verification";

interface ChainRecord {
  batchIdHash: Hex;
  supersedesRecordHash: Hex;
  supersededByRecordHash: Hex;
  issuer: Hex;
  registeredAt: bigint;
  status: number;
  metadataURI: string;
}

const TONES = {
  verified: {
    frame: "border-monad-600/60 bg-monad-950/40",
    label: "text-monad-200",
  },
  warning: {
    frame: "border-ink-600 bg-ink-850",
    label: "text-ink-100",
  },
  failed: {
    frame: "border-alert-500 bg-alert-950",
    label: "text-alert-200",
  },
  neutral: {
    frame: "border-ink-700 bg-ink-900",
    label: "text-ink-200",
  },
} as const;

export function VerifyPanel() {
  const [text, setText] = useState("");
  const [recordHashInput, setRecordHashInput] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // --- Everything below happens in this browser --------------------------
  const candidate = useMemo(() => readCandidate(text), [text]);

  const typedHash = recordHashInput.trim();
  const typedHashValid = typedHash === "" || isRecordHash(typedHash);

  /**
   * The record to check against. A hash the reader typed wins, so they can
   * check a file against a specific version rather than whichever one happens
   * to match. Otherwise the document's own hash is the claim being tested.
   */
  const targetHash: Hex | null = candidate.ok
    ? typedHash !== "" && isRecordHash(typedHash)
      ? (typedHash.toLowerCase() as Hex)
      : candidate.recordHash
    : typedHash !== "" && isRecordHash(typedHash)
      ? (typedHash.toLowerCase() as Hex)
      : null;

  // --- Chain reads. Public: no wallet, no connection. --------------------
  const { data: candidateRegistered, isLoading: existsLoading } = useReadContract({
    address: PROVENANCE_ADDRESS ?? undefined,
    abi: kimchiProvenanceAbi,
    functionName: "exists",
    args: candidate.ok ? [candidate.recordHash] : undefined,
    query: { enabled: PROVENANCE_ADDRESS !== null && candidate.ok },
  });

  const { data: versions } = useReadContract({
    address: PROVENANCE_ADDRESS ?? undefined,
    abi: kimchiProvenanceAbi,
    functionName: "getVersions",
    args: candidate.ok ? [candidate.batchIdHashValue] : undefined,
    query: { enabled: PROVENANCE_ADDRESS !== null && candidate.ok },
  });

  const { data: targetRecord } = useReadContract({
    address: PROVENANCE_ADDRESS ?? undefined,
    abi: kimchiProvenanceAbi,
    functionName: "getBatch",
    args: targetHash === null ? undefined : [targetHash],
    query: { enabled: PROVENANCE_ADDRESS !== null && targetHash !== null, retry: false },
  });

  const chainRecord = targetRecord as ChainRecord | undefined;
  const versionList = (versions as Hex[] | undefined) ?? [];

  // --- Verdict -----------------------------------------------------------
  const outcome: VerificationOutcome | null = useMemo(() => {
    if (!candidate.ok) return text.trim() === "" ? null : "INVALID_FORMAT";
    if (candidateRegistered === undefined) return null;

    return decideOutcome({
      candidateRegistered: candidateRegistered === true,
      supersededBy:
        candidateRegistered === true ? (chainRecord?.supersededByRecordHash ?? null) : null,
      batchVersionCount: versionList.length,
    });
  }, [candidate.ok, candidateRegistered, chainRecord, versionList.length, text]);

  /**
   * For a mismatch, load the registered document so the difference can be
   * named field by field. Reuses the passport's resolver, so a bundled document
   * is used when one hashes to the record — the demo needs no network.
   */
  const diffAgainstHash =
    outcome === "MODIFIED"
      ? typedHash !== "" && isRecordHash(typedHash)
        ? (typedHash.toLowerCase() as Hex)
        : (versionList.at(-1) ?? null)
      : null;

  const { data: registeredDoc } = useQuery({
    queryKey: ["verify-registered-doc", diffAgainstHash],
    enabled: diffAgainstHash !== null,
    staleTime: 60_000,
    queryFn: async () => {
      const record = chainRecord;
      return resolveMetadata(diffAgainstHash as string, record?.metadataURI ?? "");
    },
  });

  const differences = useMemo(() => {
    if (outcome !== "MODIFIED" || !candidate.ok) return null;
    if (registeredDoc?.metadata == null) return null;
    return diffMetadata(registeredDoc.metadata, candidate.metadata);
  }, [outcome, candidate, registeredDoc]);

  // --- Input handlers ----------------------------------------------------
  async function onFile(file: File | undefined) {
    if (file === undefined) return;
    setFileName(file.name);
    setText(await file.text());
  }

  function reset() {
    setText("");
    setFileName(null);
    setRecordHashInput("");
    if (fileInput.current !== null) fileInput.current.value = "";
  }

  const copy = outcome === null ? null : OUTCOME_COPY[outcome];
  const tone = copy === null ? TONES.neutral : TONES[copy.tone];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:items-start">
      {/* ------------------------------------------------- input column */}
      <div className="flex flex-col gap-4">
        <AuditPanel title="Document to check">
          <p className="text-ink-400 mb-5 text-[13px] leading-relaxed">
            Hashing happens entirely in your browser. This file is never uploaded,
            never sent to a server, and never leaves your machine — which is what
            makes this check independent of Madame Kimchi.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              onChange={(event) => void onFile(event.target.files?.[0])}
              className="text-ink-400 file:border-ink-700 file:bg-ink-850 file:text-ink-200 hover:file:border-ink-600 w-full text-[12px] file:mr-3 file:cursor-pointer file:rounded-sm file:border file:px-3 file:py-2 file:font-mono file:text-[11px] file:uppercase file:tracking-[0.14em]"
            />
          </div>

          {fileName !== null && (
            <p className="text-ink-400 mt-2 font-mono text-[11px]">
              Loaded {fileName} — read locally.
            </p>
          )}

          <div className="mt-5">
            <label className="flex flex-col gap-1.5">
              <span className="text-ink-400 font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">
                Or paste the JSON
              </span>
              <textarea
                rows={14}
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  setFileName(null);
                }}
                placeholder='{ "schemaVersion": 1, "batchId": "MK-DEMO-2026-001", … }'
                className="border-ink-700 bg-ink-950 text-ink-200 placeholder:text-ink-400 focus:border-monad-600 w-full resize-y rounded-sm border px-3 py-2 font-mono text-[11px] leading-relaxed"
              />
            </label>
          </div>

          <div className="mt-5">
            <label className="flex flex-col gap-1.5">
              <span className="text-ink-400 font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">
                Record hash (optional)
              </span>
              <input
                value={recordHashInput}
                onChange={(event) => setRecordHashInput(event.target.value)}
                placeholder="0x… check against a specific registered version"
                className={`bg-ink-950 text-paper-100 placeholder:text-ink-400 focus:border-monad-600 tabular w-full rounded-sm border px-3 py-2 font-mono text-[12px] ${
                  typedHashValid ? "border-ink-700" : "border-alert-600"
                }`}
              />
              {!typedHashValid && (
                <span className="text-alert-300 text-[11px]">
                  A record hash is 0x followed by 64 hexadecimal characters.
                </span>
              )}
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button tone="ghost" onClick={reset}>
              Clear
            </Button>
            <Button
              tone="ghost"
              onClick={() => {
                void fetch("/demo-batch.json")
                  .then((r) => r.text())
                  .then((t) => {
                    setText(t);
                    setFileName("demo-batch.json (bundled)");
                  });
              }}
            >
              Load demo document
            </Button>
          </div>
        </AuditPanel>
      </div>

      {/* ------------------------------------------------ result column */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-24">
        {PROVENANCE_ADDRESS === null && (
          <Notice tone="alert" title="Registry not configured">
            No contract address is available, so nothing can be compared against
            the chain. The document can still be validated and hashed locally.
          </Notice>
        )}

        {/* Verdict. */}
        <div className={`rounded-sm border px-5 py-4 ${tone.frame}`}>
          <p
            className={`font-mono text-[12px] font-semibold uppercase tracking-[0.18em] ${tone.label}`}
          >
            {copy?.title ??
              (text.trim() === ""
                ? "Awaiting a document"
                : existsLoading
                  ? "Checking against Monad Testnet"
                  : "Reading")}
          </p>
          <p className="text-ink-300 mt-2 text-[13px] leading-relaxed">
            {copy?.body ??
              "Upload or paste a batch metadata document. It will be validated, canonicalized, and hashed here in your browser, then compared with the record on Monad Testnet."}
          </p>
        </div>

        {/* Locally computed hash. */}
        {candidate.ok && (
          <AuditPanel title="Computed locally" tone="crypto">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-ink-400 font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">
                  Hash of this document
                </span>
                <MonoValue tone={outcome === "MODIFIED" ? "alert" : "crypto"}>
                  {candidate.recordHash}
                </MonoValue>
              </div>

              {outcome === "MODIFIED" && diffAgainstHash !== null && (
                <div className="flex flex-col gap-1">
                  <span className="text-ink-400 font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">
                    Registered on Monad
                  </span>
                  <MonoValue tone="crypto">{diffAgainstHash}</MonoValue>
                </div>
              )}

              <div className="flex flex-col gap-1">
                <span className="text-ink-400 font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">
                  Batch ID
                </span>
                <MonoValue>{candidate.metadata.batchId}</MonoValue>
              </div>

              <p className="text-ink-400 border-ink-800 border-t pt-3 text-[11px] leading-relaxed">
                {new TextEncoder().encode(candidate.canonicalJson).length} canonical
                bytes. Re-indenting the file, reordering its keys, or changing its
                line endings will not change this hash.
              </p>
            </div>
          </AuditPanel>
        )}

        {/* Schema problems. */}
        {!candidate.ok && text.trim() !== "" && (
          <AuditPanel title="Why it could not be read">
            <p className="text-ink-400 mb-3 text-[12px] leading-relaxed">
              {candidate.summary}
            </p>
            {candidate.issues.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {candidate.issues.map((issue, index) => (
                  <li key={index} className="text-[12px] leading-relaxed">
                    <code className="text-alert-300 font-mono text-[11px]">
                      {issue.path}
                    </code>
                    <span className="text-ink-400"> — {issue.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </AuditPanel>
        )}

        {/* Field-level diff. */}
        {outcome === "MODIFIED" && (
          <AuditPanel title="What differs" tone="alert">
            {differences === null ? (
              <p className="text-ink-400 text-[12px] leading-relaxed">
                The hashes differ, so this file is not the registered document.
                The registered document itself could not be loaded, so the
                individual changed fields cannot be listed.
              </p>
            ) : differences.length === 0 ? (
              <p className="text-ink-400 text-[12px] leading-relaxed">
                No field-level differences were found against the loaded document,
                which means the mismatch is against a different registered
                version. Enter a specific record hash above to compare directly.
              </p>
            ) : (
              <>
                <p className="text-ink-400 mb-4 text-[12px] leading-relaxed">
                  {differences.length} field
                  {differences.length === 1 ? "" : "s"} differ from the registered
                  version. This shows what changed, not who changed it or why.
                </p>
                <div className="flex flex-col gap-3">
                  {differences.slice(0, 30).map((difference) => (
                    <div
                      key={difference.path}
                      className="border-ink-800 border-l-2 pl-3"
                    >
                      <code className="text-paper-100 font-mono text-[11px] break-all">
                        {difference.path}
                      </code>
                      <div className="mt-1.5 flex flex-col gap-1">
                        <div className="flex gap-2">
                          <span className="text-ink-400 shrink-0 font-mono text-[11px] uppercase">
                            registered
                          </span>
                          <span className="text-ink-300 font-mono text-[11px] break-all">
                            {difference.registered}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-alert-400 shrink-0 font-mono text-[11px] uppercase">
                            your file
                          </span>
                          <span className="text-alert-200 font-mono text-[11px] break-all">
                            {difference.candidate}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </AuditPanel>
        )}

        {/* Chain context. */}
        {chainRecord !== undefined && outcome !== null && outcome !== "INVALID_FORMAT" && (
          <AuditPanel title="Registered record">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-ink-400 font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">
                  Registered by
                </span>
                <a
                  href={explorerAddressUrl(chainRecord.issuer)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-monad-400 hover:text-monad-300 font-mono text-[12px] break-all"
                >
                  {chainRecord.issuer} ↗
                </a>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-ink-400 font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">
                  Status
                </span>
                <MonoValue>{statusName(Number(chainRecord.status))}</MonoValue>
              </div>

              {chainRecord.supersededByRecordHash !== ZERO_HASH && (
                <div className="flex flex-col gap-1">
                  <span className="text-ink-400 font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">
                    Superseded by
                  </span>
                  <Link
                    href={`/trace/${chainRecord.supersededByRecordHash}`}
                    className="text-monad-400 hover:text-monad-300 font-mono text-[12px] break-all"
                  >
                    {chainRecord.supersededByRecordHash}
                  </Link>
                </div>
              )}

              {targetHash !== null && (
                <Link
                  href={`/trace/${targetHash}`}
                  className="text-monad-400 hover:text-monad-300 mt-1 font-mono text-[11px] uppercase tracking-[0.14em]"
                >
                  Open the Batch Passport →
                </Link>
              )}
            </div>
          </AuditPanel>
        )}

        <p className="text-ink-400 px-1 text-[11px] leading-relaxed">
          A matching hash shows the published record is cryptographically
          unchanged. It does not show that the contents are true, that the product
          is safe, or that a physical jar matches this record.
        </p>
      </div>
    </div>
  );
}
