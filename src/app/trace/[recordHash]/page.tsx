import type { Metadata } from "next";
import Link from "next/link";

import { MonoValue } from "@/components/MonoValue";
import { PageHeader } from "@/components/PageHeader";
import { isRecordHash } from "@/lib/contract";

import { BatchPassport } from "./BatchPassport";

export const metadata: Metadata = {
  title: "Batch Passport",
  description:
    "Public, tamper-evident record of a Madame Kimchi batch, registered on Monad Testnet.",
};

/**
 * Public Batch Passport. No wallet, no connection, no account required —
 * everything on this page is a public read, because a record only anyone can
 * check is worth registering in the first place.
 *
 * In Next 16 route params are async and must be awaited.
 */
export default async function BatchPassportPage({
  params,
}: {
  params: Promise<{ recordHash: string }>;
}) {
  const { recordHash } = await params;

  if (!isRecordHash(recordHash)) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-14">
        <PageHeader
          eyebrow="Batch Passport"
          title="Not a valid record hash"
          lede="A record hash is 0x followed by 64 hexadecimal characters. Check the link or the scanned code."
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

  // Lowercased so a link pasted in mixed case addresses the same record.
  const normalized = recordHash.toLowerCase() as `0x${string}`;

  return (
    <div className="mx-auto max-w-7xl px-5 py-14">
      <PageHeader
        eyebrow="Public Batch Passport"
        title="Batch record"
        lede="Anyone can read this record and check it against Monad Testnet. No wallet, account, or permission is required."
      />

      <div className="mt-10">
        <BatchPassport recordHash={normalized} />
      </div>
    </div>
  );
}
