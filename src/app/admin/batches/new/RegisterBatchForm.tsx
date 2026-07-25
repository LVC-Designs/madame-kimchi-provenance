"use client";

import { useMemo, useState } from "react";
import type { Hex } from "viem";
import {
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { AuditPanel } from "@/components/AuditPanel";
import { Button } from "@/components/Button";
import { TextField } from "@/components/FormControls";
import { MonoValue } from "@/components/MonoValue";
import { Notice } from "@/components/Notice";
import { VerifierGates } from "@/components/VerifierGates";
import { batchIdHash, canonicalize, hashBatchMetadata } from "@/lib/canonical";
import { PROVENANCE_ADDRESS, ZERO_HASH, kimchiProvenanceAbi } from "@/lib/contract";
import { explorerAddressUrl, explorerTxUrl } from "@/lib/monad";
import { batchStatusIndex, fieldErrors, safeParseBatchMetadata } from "@/lib/schema";
import { useVerifierGate } from "@/lib/useVerifierGate";
import { classifyWriteError } from "@/lib/writeErrors";

import { CanonicalPreview } from "./CanonicalPreview";
import { MetadataFields } from "./MetadataFields";
import { demoDraft, draftToMetadata, nowInstant, type BatchDraft } from "./draft";

export function RegisterBatchForm() {
  const [draft, setDraft] = useState<BatchDraft>(demoDraft);
  const [metadataUri, setMetadataUri] = useState("");

  const gate = useVerifierGate();

  // --- Validation and hashing -------------------------------------------
  const { metadata, errors, canonicalJson, recordHash, batchIdHashValue } =
    useMemo(() => {
      const parsed = safeParseBatchMetadata(draftToMetadata(draft));

      if (!parsed.success) {
        return {
          metadata: null,
          errors: fieldErrors(parsed.error),
          canonicalJson: null,
          recordHash: null,
          batchIdHashValue: null,
        };
      }

      return {
        metadata: parsed.data,
        errors: {} as Record<string, string>,
        canonicalJson: canonicalize(parsed.data),
        recordHash: hashBatchMetadata(parsed.data),
        batchIdHashValue: batchIdHash(parsed.data.batchId),
      };
    }, [draft]);

  // --- On-chain reads ----------------------------------------------------
  // Warn before spending gas on a hash the registry will reject as duplicate.
  const { data: alreadyRegistered } = useReadContract({
    address: PROVENANCE_ADDRESS ?? undefined,
    abi: kimchiProvenanceAbi,
    functionName: "exists",
    args: recordHash === null ? undefined : [recordHash],
    query: {
      enabled: gate.configured && gate.isConnected && gate.onMonad && recordHash !== null,
    },
  });

  // --- Write -------------------------------------------------------------
  const {
    writeContract,
    data: txHash,
    isPending: awaitingSignature,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();

  const {
    isLoading: mining,
    isSuccess: confirmed,
    data: receipt,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash: txHash });

  const failure = useMemo(() => {
    if (writeError !== null) return classifyWriteError(writeError);
    if (receiptError !== null && receiptError !== undefined)
      return classifyWriteError(receiptError);
    return null;
  }, [writeError, receiptError]);

  const busy = awaitingSignature || mining;

  const submittable =
    gate.ready &&
    metadata !== null &&
    recordHash !== null &&
    alreadyRegistered !== true &&
    !busy;

  function submit() {
    if (
      !submittable ||
      metadata === null ||
      recordHash === null ||
      PROVENANCE_ADDRESS === null
    ) {
      return;
    }

    writeContract({
      address: PROVENANCE_ADDRESS,
      abi: kimchiProvenanceAbi,
      functionName: "registerBatch",
      args: [
        recordHash,
        batchIdHash(metadata.batchId),
        (metadata.supersedesRecordHash ?? ZERO_HASH) as Hex,
        batchStatusIndex(metadata.status),
        metadataUri.trim(),
      ],
    });
  }

  // -----------------------------------------------------------------------
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
      {/* ------------------------------------------------ form column */}
      <div className="flex flex-col gap-8">
        <AuditPanel
          title="Batch metadata"
          meta={
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDraft(demoDraft())}
                className="text-ink-400 hover:text-paper-100 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors"
              >
                Load demo fixture
              </button>
              <span className="text-ink-700">·</span>
              <button
                type="button"
                onClick={() =>
                  setDraft((current) => ({ ...current, generatedAt: nowInstant() }))
                }
                className="text-ink-400 hover:text-paper-100 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors"
              >
                Stamp time now
              </button>
            </div>
          }
        >
          <MetadataFields draft={draft} errors={errors} onChange={setDraft} />

          <div className="border-ink-800 mt-8 border-t pt-6">
            <MonoValue tone="muted">generatedAt = {draft.generatedAt}</MonoValue>
            <p className="text-ink-400 mt-1.5 text-[11px] leading-relaxed">
              Held fixed so the hash does not change as you type. Re-stamp it to
              publish a distinct record from otherwise identical fields.
            </p>
          </div>
        </AuditPanel>
      </div>

      {/* --------------------------------------------- verification column */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-24">
        {/* Gates, in the order a verifier hits them. */}
        <VerifierGates gate={gate} />

        {/* Canonical bytes and the hashes derived from them. */}
        <CanonicalPreview
          metadata={metadata}
          canonicalJson={canonicalJson}
          recordHash={recordHash}
          batchIdHashValue={batchIdHashValue}
          alreadyRegistered={alreadyRegistered as boolean | undefined}
          onRestamp={() =>
            setDraft((current) => ({ ...current, generatedAt: nowInstant() }))
          }
        />

        {/* Transaction review. */}
        <AuditPanel title="Transaction review">
          <div className="flex flex-col gap-4">
            <TextField
              label="Public metadata URI (optional)"
              value={metadataUri}
              onChange={setMetadataUri}
              placeholder="https://… or leave blank"
              hint="Not part of the hashed record. Leave blank to register the hash alone."
            />

            <dl className="border-ink-800 grid gap-3 border-t pt-4 text-[12px]">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-400 font-mono text-[11px] uppercase tracking-[0.14em]">
                  Function
                </dt>
                <dd>
                  <MonoValue>registerBatch</MonoValue>
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-400 font-mono text-[11px] uppercase tracking-[0.14em]">
                  Contract
                </dt>
                <dd className="min-w-0 text-right">
                  <MonoValue tone="crypto">
                    {PROVENANCE_ADDRESS ?? "not configured"}
                  </MonoValue>
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-400 font-mono text-[11px] uppercase tracking-[0.14em]">
                  Status arg
                </dt>
                <dd>
                  <MonoValue>
                    {metadata === null
                      ? "—"
                      : `${metadata.status} (${batchStatusIndex(metadata.status)})`}
                  </MonoValue>
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-400 font-mono text-[11px] uppercase tracking-[0.14em]">
                  Supersedes
                </dt>
                <dd className="min-w-0 text-right">
                  <MonoValue tone="muted">
                    {metadata?.supersedesRecordHash ?? "none"}
                  </MonoValue>
                </dd>
              </div>
            </dl>

            <Button
              tone="crypto"
              disabled={!submittable}
              onClick={submit}
              className="mt-1 w-full py-3"
            >
              {awaitingSignature
                ? "Confirm in wallet…"
                : mining
                  ? "Registering on Monad…"
                  : "Register batch on Monad Testnet"}
            </Button>

            <p className="text-ink-400 text-[11px] leading-relaxed">
              Registering records that an authorized verifier published these
              exact bytes. It asserts nothing about whether they are true.
            </p>
          </div>
        </AuditPanel>

        {/* Outcome. */}
        {awaitingSignature && (
          <Notice tone="info" title="Awaiting signature">
            Confirm the transaction in MetaMask. Nothing has been sent yet.
          </Notice>
        )}

        {mining && txHash !== undefined && (
          <Notice tone="info" title="Pending on Monad Testnet">
            <p className="mb-2">Submitted, waiting for confirmation.</p>
            <a
              href={explorerTxUrl(txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-monad-400 hover:text-monad-300 font-mono text-[11px] break-all"
            >
              {txHash} ↗
            </a>
          </Notice>
        )}

        {confirmed && txHash !== undefined && (
          <Notice tone="crypto" title="Registered">
            <p className="mb-2">
              Recorded in block{" "}
              <span className="tabular font-mono">
                {receipt?.blockNumber.toString()}
              </span>
              .
            </p>
            <div className="flex flex-col gap-1">
              <a
                href={explorerTxUrl(txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-monad-400 hover:text-monad-300 font-mono text-[11px] break-all"
              >
                Transaction on MonadScan ↗
              </a>
              {PROVENANCE_ADDRESS !== null && (
                <a
                  href={explorerAddressUrl(PROVENANCE_ADDRESS)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-monad-400 hover:text-monad-300 font-mono text-[11px] break-all"
                >
                  Registry contract on MonadScan ↗
                </a>
              )}
            </div>
          </Notice>
        )}

        {failure !== null && (
          <Notice
            tone={failure.kind === "rejected" ? "info" : "alert"}
            title={failure.title}
            action={
              <Button tone="ghost" onClick={() => resetWrite()}>
                Dismiss
              </Button>
            }
          >
            {failure.detail}
          </Notice>
        )}
      </div>
    </div>
  );
}
