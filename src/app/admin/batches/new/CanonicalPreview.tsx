"use client";

import type { Hex } from "viem";

import { AuditPanel } from "@/components/AuditPanel";
import { Button } from "@/components/Button";
import { MonoValue } from "@/components/MonoValue";
import { toCanonicalDownload } from "@/lib/canonical";
import type { BatchMetadata } from "@/lib/schema";

/**
 * The exact bytes that will be hashed, alongside the hashes derived from them.
 *
 * Shown before submission rather than after, because a verifier is being asked
 * to sign an assertion about a specific byte sequence, and "trust the form"
 * would defeat the point of canonicalization.
 */
export function CanonicalPreview({
  metadata,
  canonicalJson,
  recordHash,
  batchIdHashValue,
  alreadyRegistered,
}: {
  metadata: BatchMetadata | null;
  canonicalJson: string | null;
  recordHash: Hex | null;
  batchIdHashValue: Hex | null;
  /** `undefined` while the on-chain check is in flight. */
  alreadyRegistered: boolean | undefined;
}) {
  function download() {
    if (metadata === null) return;
    const { filename, contents, mimeType } = toCanonicalDownload(metadata);
    const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (metadata === null || canonicalJson === null || recordHash === null) {
    return (
      <AuditPanel title="Canonical record">
        <p className="text-ink-400 text-[13px] leading-relaxed">
          The canonical form and its hash appear once every field is valid.
          Nothing is hashed from an incomplete record.
        </p>
      </AuditPanel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <AuditPanel
        title="Canonical JSON"
        meta={
          <span className="tabular font-mono text-[11px]">
            {new TextEncoder().encode(canonicalJson).length} bytes
          </span>
        }
      >
        <pre className="bg-ink-950 border-ink-800 text-ink-300 max-h-72 overflow-auto rounded-sm border p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all">
          {canonicalJson}
        </pre>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" tone="ghost" onClick={download}>
            Download canonical JSON
          </Button>
          <span className="text-ink-400 text-[11px] leading-relaxed">
            These are the exact bytes measured. Re-indenting the file later will
            not change its hash.
          </span>
        </div>
      </AuditPanel>

      <AuditPanel title="Derived hashes" tone="crypto">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-ink-400 font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">
              Metadata hash
            </span>
            <MonoValue tone="crypto">{recordHash}</MonoValue>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-ink-400 font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">
              Record hash
            </span>
            <MonoValue tone="crypto">{recordHash}</MonoValue>
            <span className="text-ink-400 text-[11px] leading-relaxed">
              Identical by design: a record&rsquo;s identity is the hash of its
              canonical metadata, so verifying a downloaded file is a single
              lookup with no derivation step to reproduce.
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-ink-400 font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">
              Batch ID hash
            </span>
            <MonoValue tone="crypto">{batchIdHashValue}</MonoValue>
            <span className="text-ink-400 text-[11px] leading-relaxed">
              Groups every version of this batch, including future corrections.
            </span>
          </div>
        </div>

        {alreadyRegistered === true && (
          <p className="border-alert-600/50 bg-alert-950/50 text-alert-200 mt-5 rounded-sm border px-3 py-2.5 text-[12px] leading-relaxed">
            This record hash is already registered on Monad Testnet. Records are
            never overwritten, so submitting would revert. Change a field, or
            re-stamp the generation time, to publish a distinct record.
          </p>
        )}
      </AuditPanel>
    </div>
  );
}
