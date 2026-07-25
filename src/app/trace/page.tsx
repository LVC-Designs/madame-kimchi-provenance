import type { Metadata } from "next";

import { PageHeader } from "@/components/PageHeader";

import { TraceIndex } from "./TraceIndex";

export const metadata: Metadata = { title: "Trace" };

/** Public lookup. No wallet, account, or permission required. */
export default function TracePage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-14">
      <PageHeader
        eyebrow="Public lookup"
        title="Trace a batch"
        lede="Open a Batch Passport from its record hash, its batch ID, or the list of recent registrations, and read the timeline exactly as it was registered."
      />

      <div className="mt-10">
        <TraceIndex />
      </div>
    </div>
  );
}
