import { SCHEMA_VERSION, type AttestationMetadata, type AttestationType } from "./schema.ts";

/**
 * The fictional chain-of-custody sequence for the demonstration batch.
 *
 * These eight documents are byte-for-byte what is already registered on Monad
 * Testnet — each one was verified against `attestationExists` before being
 * written here. That matters: the attestation form marks a step "on-chain" by
 * re-deriving its hash, so a single changed character anywhere below would make
 * a recorded step look unrecorded and invite a duplicate.
 *
 * Shared with the seeding script so a timeline clicked through on stage and one
 * written by script are provably the same events.
 *
 * Every party, place, and reading is invented. There are no real supplier,
 * distributor, retailer, or partner names anywhere in this file, and none may
 * be added: CLAUDE.md forbids implying commercial relationships that are not
 * backed by written agreements, and a name in a demo is exactly how such an
 * implication escapes.
 *
 * Timestamps are fixed literals rather than `now()`, so every step hashes to
 * the same value on every machine and every run. That is what makes seeding
 * idempotent.
 */
export interface DemoAttestationStep {
  type: AttestationType;
  /** Human label for the step selector. */
  label: string;
  occurredAt: string;
  location: string;
  notes: string;
  measurements: { label: string; value: string; unit: string | null }[];
}

export const DEMO_ATTESTATION_SEQUENCE: readonly DemoAttestationStep[] = [
  {
    type: "INGREDIENT_RECEIVED",
    label: "Ingredient received",
    occurredAt: "2026-01-11T07:45:00Z",
    location: "Demonstration Goods-In Bay 1",
    notes: "Fictional demonstration event. Napa cabbage and radish received.",
    measurements: [],
  },
  {
    type: "FERMENTATION_STARTED",
    label: "Fermentation started",
    occurredAt: "2026-01-12T09:30:00Z",
    location: "Demonstration Fermentation Room 2",
    notes: "Fictional demonstration event. Vessels sealed at 4 °C.",
    measurements: [],
  },
  {
    type: "QUALITY_CHECK",
    label: "Quality check",
    occurredAt: "2026-01-19T11:00:00Z",
    location: "Demonstration Fermentation Room 2",
    notes: "Fictional demonstration event. Mid-ferment check.",
    measurements: [],
  },
  {
    type: "FERMENTATION_COMPLETED",
    label: "Fermentation completed",
    occurredAt: "2026-01-26T08:15:00Z",
    location: "Demonstration Fermentation Room 2",
    notes: "Fictional demonstration event. Target acidity reached.",
    measurements: [],
  },
  {
    type: "PACKED",
    label: "Packed",
    occurredAt: "2026-01-27T13:20:00Z",
    location: "Demonstration Packing Line A",
    notes: "Fictional demonstration event. 500 g jars, lot L-2026-014.",
    measurements: [],
  },
  {
    type: "SHIPPED",
    label: "Shipped",
    occurredAt: "2026-01-28T06:10:00Z",
    location: "Demonstration Dispatch",
    notes: "Fictional demonstration event. Chilled transport.",
    measurements: [],
  },
  {
    type: "DISTRIBUTOR_RECEIVED",
    label: "Distributor received",
    occurredAt: "2026-01-29T09:00:00Z",
    location: "Fictional Demonstration Distributor",
    notes: "Fictional demonstration event. Received, temperature within range.",
    measurements: [],
  },
  {
    type: "RETAILER_RECEIVED",
    label: "Retailer received",
    occurredAt: "2026-01-31T10:30:00Z",
    location: "Fictional Demonstration Retailer",
    notes: "Fictional demonstration event. Placed on chilled shelf.",
    measurements: [],
  },
] as const;

/**
 * Builds the exact attestation document for a demo step.
 *
 * `generatedAt` deliberately equals `occurredAt` so the document is fully
 * determined by the step and the batch it belongs to — re-deriving it produces
 * an identical hash, which is what lets the form recognise recorded steps.
 */
export function demoStepToAttestation(
  step: DemoAttestationStep,
  batchRecordHash: string,
): AttestationMetadata {
  return {
    schemaVersion: SCHEMA_VERSION,
    attestationType: step.type,
    batchRecordHash,
    occurredAt: step.occurredAt,
    location: step.location,
    measurements: step.measurements,
    documentReferences: [],
    correctsAttestationHash: null,
    notes: step.notes,
    generatedAt: step.occurredAt,
  } as AttestationMetadata;
}
