import type { Metadata } from "next";

import { PageHeader } from "@/components/PageHeader";

import { VerifyPanel } from "./VerifyPanel";

export const metadata: Metadata = {
  title: "Verify",
  description:
    "Check a batch metadata document against the record registered on Monad Testnet. Hashing happens in your browser.",
};

/**
 * Independent verification. No wallet, no account, no upload.
 *
 * The whole point of the page is that it does not require trusting this site:
 * the document is read, canonicalized, and hashed locally, and the only thing
 * taken from the network is a public yes/no on whether that hash is registered.
 */
export default function VerifyPage() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-14">
      <PageHeader
        eyebrow="Independent check"
        title="Verify against the Monad record"
        lede="Hashing happens in your browser. The document never leaves your machine, and the comparison does not depend on trusting this site."
      />

      <div className="mt-10">
        <VerifyPanel />
      </div>
    </div>
  );
}
