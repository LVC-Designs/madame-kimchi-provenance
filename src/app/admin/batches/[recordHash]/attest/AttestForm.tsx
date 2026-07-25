"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Hex } from "viem";
import {
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { AuditPanel } from "@/components/AuditPanel";
import { Button } from "@/components/Button";
import {
  RepeatableGroup,
  RepeatableRow,
  SelectField,
  TextArea,
  TextField,
} from "@/components/FormControls";
import { MonoValue } from "@/components/MonoValue";
import { Notice } from "@/components/Notice";
import { Timeline } from "@/components/Timeline";
import { VerifierGates } from "@/components/VerifierGates";
import { canonicalize, canonicalHash } from "@/lib/canonical";
import { PROVENANCE_ADDRESS, kimchiProvenanceAbi } from "@/lib/contract";
import { DEMO_ATTESTATION_SEQUENCE, demoStepToAttestation } from "@/lib/demoSequence";
import { eventsForRecord, fetchRegistryEvents } from "@/lib/events";
import { explorerTxUrl } from "@/lib/monad";
import {
  ATTESTATION_TYPES,
  AttestationMetadataSchema,
  SCHEMA_VERSION,
  attestationTypeIndex,
  fieldErrors,
  type AttestationType,
} from "@/lib/schema";
import { useVerifierGate } from "@/lib/useVerifierGate";
import { classifyWriteError } from "@/lib/writeErrors";

/** `datetime-local` gives `2026-01-12T09:30`; the fields are labelled UTC. */
function localToInstant(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  return `${trimmed.length === 16 ? `${trimmed}:00` : trimmed}Z`;
}

function instantToLocal(value: string): string {
  return value.trim() === "" ? "" : value.slice(0, 16);
}

function nowInstant(): string {
  return `${new Date().toISOString().slice(0, 19)}Z`;
}

interface MeasurementDraft {
  label: string;
  value: string;
  unit: string;
}

interface AttestDraft {
  attestationType: AttestationType;
  occurredAt: string;
  location: string;
  measurements: MeasurementDraft[];
  correctsAttestationHash: string;
  notes: string;
  generatedAt: string;
}

const TYPE_OPTIONS = ATTESTATION_TYPES.map((type) => ({
  value: type,
  label: type,
}));

export function AttestForm({ recordHash }: { recordHash: Hex }) {
  const gate = useVerifierGate();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<AttestDraft>(() => ({
    attestationType: "INGREDIENT_RECEIVED",
    occurredAt: instantToLocal(DEMO_ATTESTATION_SEQUENCE[0].occurredAt),
    location: DEMO_ATTESTATION_SEQUENCE[0].location,
    measurements: DEMO_ATTESTATION_SEQUENCE[0].measurements.map((m) => ({
      label: m.label,
      value: m.value,
      unit: m.unit ?? "",
    })),
    correctsAttestationHash: "",
    notes: DEMO_ATTESTATION_SEQUENCE[0].notes,
    generatedAt: DEMO_ATTESTATION_SEQUENCE[0].occurredAt,
  }));

  const set = <K extends keyof AttestDraft>(key: K, value: AttestDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  // --- Does the target batch exist? --------------------------------------
  const { data: batchExists, isLoading: existsLoading } = useReadContract({
    address: PROVENANCE_ADDRESS ?? undefined,
    abi: kimchiProvenanceAbi,
    functionName: "exists",
    args: [recordHash],
    query: { enabled: gate.configured },
  });

  const { data: attestationCount } = useReadContract({
    address: PROVENANCE_ADDRESS ?? undefined,
    abi: kimchiProvenanceAbi,
    functionName: "attestationCount",
    args: [recordHash],
    query: { enabled: gate.configured && batchExists === true },
  });

  // --- Canonicalize and hash, locally ------------------------------------
  const { attestation, errors, canonicalJson, attestationHash } = useMemo(() => {
    const candidate = {
      schemaVersion: SCHEMA_VERSION,
      attestationType: draft.attestationType,
      batchRecordHash: recordHash.toLowerCase(),
      occurredAt: localToInstant(draft.occurredAt),
      location: draft.location.trim() === "" ? null : draft.location.trim(),
      measurements: draft.measurements.map((m) => ({
        label: m.label.trim(),
        value: m.value.trim(),
        unit: m.unit.trim() === "" ? null : m.unit.trim(),
      })),
      documentReferences: [],
      correctsAttestationHash:
        draft.correctsAttestationHash.trim() === ""
          ? null
          : draft.correctsAttestationHash.trim(),
      notes: draft.notes.trim() === "" ? null : draft.notes.trim(),
      generatedAt: draft.generatedAt,
    };

    const parsed = AttestationMetadataSchema.safeParse(candidate);
    if (!parsed.success) {
      return {
        attestation: null,
        errors: fieldErrors(parsed.error),
        canonicalJson: null,
        attestationHash: null,
      };
    }

    return {
      attestation: parsed.data,
      errors: {} as Record<string, string>,
      canonicalJson: canonicalize(parsed.data),
      attestationHash: canonicalHash(parsed.data),
    };
  }, [draft, recordHash]);

  // --- Which demo steps are already on-chain? One multicall. -------------
  const demoHashes = useMemo(
    () =>
      DEMO_ATTESTATION_SEQUENCE.map((step) =>
        canonicalHash(demoStepToAttestation(step, recordHash.toLowerCase())),
      ),
    [recordHash],
  );

  const { data: demoRecorded, refetch: refetchDemoRecorded } = useReadContracts({
    contracts: demoHashes.map((hash) => ({
      address: PROVENANCE_ADDRESS ?? undefined,
      abi: kimchiProvenanceAbi,
      functionName: "attestationExists" as const,
      args: [hash] as const,
    })),
    query: { enabled: gate.configured && batchExists === true },
  });

  const recordedFlags = (demoRecorded ?? []).map((r) => r?.result === true);
  const nextStepIndex = recordedFlags.findIndex((done) => !done);

  const { data: currentHashRecorded } = useReadContract({
    address: PROVENANCE_ADDRESS ?? undefined,
    abi: kimchiProvenanceAbi,
    functionName: "attestationExists",
    args: attestationHash === null ? undefined : [attestationHash],
    query: { enabled: gate.configured && attestationHash !== null },
  });

  // --- Public timeline ---------------------------------------------------
  const timelineQueryKey = ["timeline", recordHash] as const;

  const { data: timeline, isLoading: timelineLoading } = useQuery({
    queryKey: timelineQueryKey,
    enabled: gate.configured && batchExists === true && publicClient !== undefined,
    staleTime: 15_000,
    queryFn: async () => {
      const result = await fetchRegistryEvents(publicClient!, PROVENANCE_ADDRESS!);
      return { ...result, events: eventsForRecord(result.events, recordHash) };
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

  /**
   * Refresh the public timeline once the attestation is confirmed.
   *
   * This is the point of the phase rather than a nicety: an attestation you
   * cannot watch land is indistinguishable from one that never did. Keyed on
   * the transaction hash so it fires once per confirmation.
   */
  useEffect(() => {
    if (!confirmed || txHash === undefined) return;
    void queryClient.invalidateQueries({ queryKey: ["timeline", recordHash] });
    void refetchDemoRecorded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmed, txHash]);

  const failure = useMemo(() => {
    if (writeError !== null) return classifyWriteError(writeError);
    if (receiptError !== null && receiptError !== undefined)
      return classifyWriteError(receiptError);
    return null;
  }, [writeError, receiptError]);

  const busy = awaitingSignature || mining;

  const submittable =
    gate.ready &&
    batchExists === true &&
    attestation !== null &&
    attestationHash !== null &&
    currentHashRecorded !== true &&
    !busy;

  function loadStep(index: number) {
    const step = DEMO_ATTESTATION_SEQUENCE[index];
    if (step === undefined) return;

    setDraft({
      attestationType: step.type,
      occurredAt: instantToLocal(step.occurredAt),
      location: step.location,
      measurements: step.measurements.map((m) => ({
        label: m.label,
        value: m.value,
        unit: m.unit ?? "",
      })),
      correctsAttestationHash: "",
      notes: step.notes,
      generatedAt: step.occurredAt,
    });
    resetWrite();
  }

  function submit() {
    if (!submittable || attestation === null || attestationHash === null) return;
    if (PROVENANCE_ADDRESS === null) return;

    writeContract({
      address: PROVENANCE_ADDRESS,
      abi: kimchiProvenanceAbi,
      functionName: "addAttestation",
      args: [
        recordHash,
        attestationHash,
        attestationTypeIndex(attestation.attestationType),
        "",
      ],
    });
  }

  // -----------------------------------------------------------------------
  if (gate.configured && !existsLoading && batchExists === false) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="alert" title="No such batch record">
          <p className="mb-2">
            The registry holds no record for this hash, so nothing can be appended
            to it.
          </p>
          <MonoValue tone="alert">{recordHash}</MonoValue>
        </Notice>
        <Link
          href="/admin/batches/new"
          className="text-monad-400 hover:text-monad-300 font-mono text-[11px] uppercase tracking-[0.14em]"
        >
          ← Register a batch first
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
      {/* ------------------------------------------------ form column */}
      <div className="flex flex-col gap-6">
        {/* Demo sequence stepper. */}
        <AuditPanel
          title="Fictional demonstration sequence"
          meta={
            <span className="tabular font-mono text-[11px]">
              {recordedFlags.filter(Boolean).length} / {DEMO_ATTESTATION_SEQUENCE.length}{" "}
              recorded
            </span>
          }
        >
          <p className="text-ink-400 mb-4 text-[12px] leading-relaxed">
            Load a step to fill the form with fictional data, then sign it. Every
            party and place is invented; no real supplier, distributor, or
            retailer is named or implied.
          </p>

          <ol className="flex flex-col gap-1.5">
            {DEMO_ATTESTATION_SEQUENCE.map((step, index) => {
              const done = recordedFlags[index] === true;
              const isNext = index === nextStepIndex;

              return (
                <li key={step.type}>
                  <button
                    type="button"
                    onClick={() => loadStep(index)}
                    className={`flex w-full items-center gap-3 rounded-sm border px-3 py-2 text-left transition-colors ${
                      done
                        ? "border-monad-700/40 bg-monad-950/30"
                        : isNext
                          ? "border-ink-600 bg-ink-850 hover:border-ink-500"
                          : "border-ink-800 hover:border-ink-700"
                    }`}
                  >
                    <span
                      className={`tabular font-mono text-[11px] ${
                        done ? "text-monad-400" : "text-ink-400"
                      }`}
                    >
                      {done ? "✓" : String(index + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={`flex-1 font-serif text-[15px] ${
                        done ? "text-monad-200" : "text-paper-100"
                      }`}
                    >
                      {step.label}
                    </span>
                    {isNext && (
                      <span className="text-ink-400 font-mono text-[9px] uppercase tracking-[0.14em]">
                        Next
                      </span>
                    )}
                    {done && (
                      <span className="text-monad-400 font-mono text-[9px] uppercase tracking-[0.14em]">
                        On-chain
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </AuditPanel>

        {/* Attestation fields. */}
        <AuditPanel
          title="Attestation"
          meta={
            <button
              type="button"
              onClick={() => set("generatedAt", nowInstant())}
              className="text-ink-400 hover:text-paper-100 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors"
            >
              Stamp time now
            </button>
          }
        >
          <div className="flex flex-col gap-5">
            <SelectField
              label="Attestation type"
              value={draft.attestationType}
              options={TYPE_OPTIONS}
              onChange={(value) => set("attestationType", value)}
              error={errors.attestationType}
              hint="A fixed vocabulary. Free-form event types are not accepted."
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Occurred at (UTC)"
                type="datetime-local"
                value={draft.occurredAt}
                onChange={(value) => set("occurredAt", value)}
                error={errors.occurredAt}
                hint="When the physical event happened, not when it was recorded."
              />
              <TextField
                label="Location"
                value={draft.location}
                onChange={(value) => set("location", value)}
                error={errors.location}
                hint="Public and non-specific. Never an exact private facility address."
              />
            </div>

            {draft.attestationType === "CORRECTION" && (
              <TextField
                label="Corrects attestation hash"
                value={draft.correctsAttestationHash}
                onChange={(value) => set("correctsAttestationHash", value)}
                error={errors.correctsAttestationHash}
                placeholder="0x…"
                hint="The entry being corrected. It stays on the timeline; corrections are appended, never applied in place."
                mono
              />
            )}

            <RepeatableGroup
              title="Measurements"
              hint="Public readings only."
              addLabel="Add measurement"
              empty={draft.measurements.length === 0}
              onAdd={() =>
                set("measurements", [
                  ...draft.measurements,
                  { label: "", value: "", unit: "" },
                ])
              }
            >
              {draft.measurements.map((measurement, index) => (
                <RepeatableRow
                  key={index}
                  index={index}
                  onRemove={() =>
                    set(
                      "measurements",
                      draft.measurements.filter((_, i) => i !== index),
                    )
                  }
                >
                  <TextField
                    label="Label"
                    value={measurement.label}
                    error={errors[`measurements.${index}.label`]}
                    onChange={(value) =>
                      set(
                        "measurements",
                        draft.measurements.map((m, i) =>
                          i === index ? { ...m, label: value } : m,
                        ),
                      )
                    }
                  />
                  <TextField
                    label="Value"
                    value={measurement.value}
                    error={errors[`measurements.${index}.value`]}
                    mono
                    onChange={(value) =>
                      set(
                        "measurements",
                        draft.measurements.map((m, i) =>
                          i === index ? { ...m, value } : m,
                        ),
                      )
                    }
                  />
                  <TextField
                    label="Unit"
                    value={measurement.unit}
                    error={errors[`measurements.${index}.unit`]}
                    mono
                    onChange={(value) =>
                      set(
                        "measurements",
                        draft.measurements.map((m, i) =>
                          i === index ? { ...m, unit: value } : m,
                        ),
                      )
                    }
                  />
                </RepeatableRow>
              ))}
            </RepeatableGroup>

            <TextArea
              label="Notes"
              value={draft.notes}
              onChange={(value) => set("notes", value)}
              error={errors.notes}
              hint="Public. No personal information, pricing, or private supplier terms."
              rows={4}
            />

            <div className="border-ink-800 border-t pt-4">
              <MonoValue tone="muted">generatedAt = {draft.generatedAt}</MonoValue>
            </div>
          </div>
        </AuditPanel>

        {/* Public timeline, refreshed after each confirmation. */}
        <AuditPanel
          title="Public timeline"
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

      {/* --------------------------------------------- verification column */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-24">
        <VerifierGates gate={gate} />

        <AuditPanel title="Target batch" tone="crypto">
          <div className="flex flex-col gap-1">
            <span className="text-ink-400 font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">
              Batch record hash
            </span>
            <MonoValue tone="crypto">{recordHash}</MonoValue>
          </div>
          <Link
            href={`/trace/${recordHash}`}
            className="text-monad-400 hover:text-monad-300 mt-3 inline-block font-mono text-[11px] uppercase tracking-[0.14em]"
          >
            Open public passport →
          </Link>
        </AuditPanel>

        {/* Public-data preview: exactly what will be hashed. */}
        <AuditPanel
          title="Public attestation data"
          meta={
            canonicalJson === null ? undefined : (
              <span className="tabular font-mono text-[11px]">
                {new TextEncoder().encode(canonicalJson).length} bytes
              </span>
            )
          }
        >
          {canonicalJson === null ? (
            <p className="text-ink-400 text-[13px] leading-relaxed">
              The canonical form and its hash appear once every field is valid.
              Nothing is hashed from an incomplete attestation.
            </p>
          ) : (
            <>
              <pre className="bg-ink-950 border-ink-800 text-ink-300 max-h-64 overflow-auto rounded-sm border p-3 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap">
                {canonicalJson}
              </pre>
              <p className="text-ink-400 mt-3 text-[11px] leading-relaxed">
                Everything above is published. Nothing else about this event is
                recorded on-chain.
              </p>
            </>
          )}
        </AuditPanel>

        <AuditPanel title="Attestation hash" tone="crypto">
          <MonoValue tone="crypto">{attestationHash ?? "—"}</MonoValue>
          <p className="text-ink-400 mt-2 text-[11px] leading-relaxed">
            keccak256 over the canonical JSON, computed in your browser. This
            value is the attestation&rsquo;s identity on-chain.
          </p>

          {currentHashRecorded === true && (
            <p className="border-alert-600/50 bg-alert-950/50 text-alert-200 mt-4 rounded-sm border px-3 py-2.5 text-[12px] leading-relaxed">
              This exact attestation is already on the timeline. Attestations are
              append-only and never duplicated — change a field, or re-stamp the
              time, to record a distinct event.
            </p>
          )}

          <Button
            tone="crypto"
            disabled={!submittable}
            onClick={submit}
            className="mt-4 w-full py-3"
          >
            {awaitingSignature
              ? "Confirm in wallet…"
              : mining
                ? "Appending on Monad…"
                : "Append attestation"}
          </Button>

          <p className="text-ink-400 mt-3 text-[11px] leading-relaxed">
            Appending records that an authorized verifier published this event at
            this time. It asserts nothing about whether the event is true.
          </p>
        </AuditPanel>

        {awaitingSignature && (
          <Notice tone="info" title="Awaiting signature">
            Confirm in MetaMask. Nothing has been sent yet.
          </Notice>
        )}

        {mining && txHash !== undefined && (
          <Notice tone="info" title="Pending on Monad Testnet">
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
          <Notice tone="crypto" title="Attestation appended">
            <p className="mb-2">
              Recorded in block{" "}
              <span className="tabular font-mono">
                {receipt?.blockNumber.toString()}
              </span>
              . The public timeline has been refreshed.
            </p>
            <a
              href={explorerTxUrl(txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-monad-400 hover:text-monad-300 font-mono text-[11px] break-all"
            >
              Transaction on MonadScan ↗
            </a>
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
