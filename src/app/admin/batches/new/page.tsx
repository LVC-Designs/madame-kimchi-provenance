import type { Metadata } from "next";

import { PageHeader } from "@/components/PageHeader";

import { RegisterBatchForm } from "./RegisterBatchForm";

export const metadata: Metadata = { title: "Register a batch" };

export default function NewBatchPage() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-14">
      <PageHeader
        eyebrow="Authorized verifier"
        title="Register a batch"
        lede="Build the public batch record, inspect the exact bytes that will be hashed, and register that hash on Monad Testnet. Records are append-only: a correction publishes a new version and the original stays readable."
      />

      <div className="mt-10">
        <RegisterBatchForm />
      </div>
    </div>
  );
}
