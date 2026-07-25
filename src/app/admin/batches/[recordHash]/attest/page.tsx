import type { Metadata } from "next";
import Link from "next/link";

import { MonoValue } from "@/components/MonoValue";
import { PageHeader } from "@/components/PageHeader";
import { isRecordHash } from "@/lib/contract";

import { AttestForm } from "./AttestForm";

export const metadata: Metadata = { title: "Append an attestation" };

/** In Next 16 route params are async and must be awaited. */
export default async function AttestPage({
  params,
}: {
  params: Promise<{ recordHash: string }>;
}) {
  const { recordHash } = await params;

  if (!isRecordHash(recordHash)) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-14">
        <PageHeader
          eyebrow="Authorized verifier"
          title="Not a valid record hash"
          lede="A record hash is 0x followed by 64 hexadecimal characters."
        />
        <div className="border-alert-600 bg-alert-950 mt-8 rounded-sm border px-5 py-4">
          <MonoValue tone="alert">{recordHash}</MonoValue>
        </div>
        <Link
          href="/trace"
          className="text-monad-400 hover:text-monad-300 mt-6 inline-block font-mono text-[11px] uppercase tracking-[0.14em]"
        >
          ← Back to lookup
        </Link>
      </div>
    );
  }

  const normalized = recordHash.toLowerCase() as `0x${string}`;

  return (
    <div className="mx-auto max-w-7xl px-5 py-14">
      <PageHeader
        eyebrow="Authorized verifier"
        title="Append an attestation"
        lede="Record a chain-of-custody event against an existing batch. Attestations are append-only: nothing already on the timeline can be edited or removed, and a correction is appended alongside what it corrects."
      />

      <div className="mt-10">
        <AttestForm recordHash={normalized} />
      </div>
    </div>
  );
}
