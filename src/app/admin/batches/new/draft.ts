import demoBatch from "../../../../../public/demo-batch.json";

import { SCHEMA_VERSION, type BatchStatus } from "@/lib/schema";

/**
 * The editable form model.
 *
 * Every field is a string because that is what an `<input>` produces. The
 * schema's nullable fields are represented by the empty string and converted to
 * `null` in `draftToMetadata` — the schema itself never sees `""` where it
 * expects `null`, so "not provided" has exactly one representation by the time
 * anything is hashed.
 */
export interface OriginDraft {
  ingredient: string;
  originRegion: string;
  originCountry: string;
  note: string;
}

export interface CertificationDraft {
  label: string;
  issuer: string;
  identifier: string;
  uri: string;
}

export interface DocumentDraft {
  label: string;
  documentType: string;
  sha256: string;
  uri: string;
}

export interface BatchDraft {
  batchId: string;
  productName: string;
  productSku: string;
  lotNumber: string;
  productionDate: string;
  /** `datetime-local` value, interpreted as UTC. */
  fermentationStart: string;
  fermentationEnd: string;
  packedDate: string;
  bestBeforeDate: string;
  ingredientOrigins: OriginDraft[];
  facilityName: string;
  certificationReferences: CertificationDraft[];
  documentReferences: DocumentDraft[];
  status: BatchStatus;
  supersedesRecordHash: string;
  notes: string;
  /** Full ISO instant, held in state so the preview hash does not churn per keystroke. */
  generatedAt: string;
}

/** `""` means "not provided", which the schema spells `null`. */
function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * `datetime-local` yields `2026-01-12T09:30`, with no seconds and no zone.
 * The fields are labelled UTC, so we complete it as UTC rather than guessing
 * at the operator's local offset — a guessed offset would silently change the
 * bytes being hashed.
 */
export function localInputToInstant(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  const withSeconds = trimmed.length === 16 ? `${trimmed}:00` : trimmed;
  return `${withSeconds}Z`;
}

/** Inverse of the above, for populating an input from an ISO instant. */
export function instantToLocalInput(value: string): string {
  return value.trim() === "" ? "" : value.slice(0, 16);
}

/** Current time as a schema-shaped instant, truncated to whole seconds. */
export function nowInstant(): string {
  return `${new Date().toISOString().slice(0, 19)}Z`;
}

/**
 * Converts the draft into the object that will be validated and hashed.
 *
 * Returns `unknown` on purpose: it is a candidate, not a `BatchMetadata`. Only
 * the schema decides whether it is one.
 */
export function draftToMetadata(draft: BatchDraft): unknown {
  return {
    schemaVersion: SCHEMA_VERSION,
    batchId: draft.batchId.trim(),
    productName: draft.productName.trim(),
    productSku: draft.productSku.trim(),
    lotNumber: draft.lotNumber.trim(),
    productionDate: draft.productionDate.trim(),
    fermentationStart: localInputToInstant(draft.fermentationStart),
    fermentationEnd: orNull(localInputToInstant(draft.fermentationEnd)),
    packedDate: draft.packedDate.trim(),
    bestBeforeDate: draft.bestBeforeDate.trim(),
    ingredientOrigins: draft.ingredientOrigins.map((origin) => ({
      ingredient: origin.ingredient.trim(),
      originRegion: origin.originRegion.trim(),
      originCountry: origin.originCountry.trim(),
      note: orNull(origin.note),
    })),
    facilityName: orNull(draft.facilityName),
    certificationReferences: draft.certificationReferences.map((certification) => ({
      label: certification.label.trim(),
      issuer: certification.issuer.trim(),
      identifier: certification.identifier.trim(),
      uri: orNull(certification.uri),
    })),
    documentReferences: draft.documentReferences.map((document) => ({
      label: document.label.trim(),
      documentType: document.documentType.trim(),
      sha256: document.sha256.trim(),
      uri: orNull(document.uri),
    })),
    status: draft.status,
    supersedesRecordHash: orNull(draft.supersedesRecordHash),
    notes: orNull(draft.notes),
    generatedAt: draft.generatedAt,
  };
}

/**
 * The bundled fictional demo batch, as a draft.
 *
 * Imported from `public/demo-batch.json` so the file served for download and
 * the file loaded into this form are the same bytes — two copies would drift,
 * and the tamper demonstration depends on them being identical.
 *
 * Its `generatedAt` is a fixed literal, so the demo record hash is stable
 * across reloads and reproducible on any machine.
 */
export function demoDraft(): BatchDraft {
  return {
    batchId: demoBatch.batchId,
    productName: demoBatch.productName,
    productSku: demoBatch.productSku,
    lotNumber: demoBatch.lotNumber,
    productionDate: demoBatch.productionDate,
    fermentationStart: instantToLocalInput(demoBatch.fermentationStart),
    fermentationEnd: instantToLocalInput(demoBatch.fermentationEnd ?? ""),
    packedDate: demoBatch.packedDate,
    bestBeforeDate: demoBatch.bestBeforeDate,
    ingredientOrigins: demoBatch.ingredientOrigins.map((origin) => ({
      ingredient: origin.ingredient,
      originRegion: origin.originRegion,
      originCountry: origin.originCountry,
      note: origin.note ?? "",
    })),
    facilityName: demoBatch.facilityName ?? "",
    certificationReferences: demoBatch.certificationReferences.map((certification) => ({
      label: certification.label,
      issuer: certification.issuer,
      identifier: certification.identifier,
      uri: certification.uri ?? "",
    })),
    documentReferences: demoBatch.documentReferences.map((document) => ({
      label: document.label,
      documentType: document.documentType,
      sha256: document.sha256,
      uri: document.uri ?? "",
    })),
    status: demoBatch.status as BatchStatus,
    supersedesRecordHash: demoBatch.supersedesRecordHash ?? "",
    notes: demoBatch.notes,
    generatedAt: demoBatch.generatedAt,
  };
}

export const emptyOrigin = (): OriginDraft => ({
  ingredient: "",
  originRegion: "",
  originCountry: "",
  note: "",
});

export const emptyCertification = (): CertificationDraft => ({
  label: "",
  issuer: "",
  identifier: "",
  uri: "",
});

export const emptyDocument = (): DocumentDraft => ({
  label: "",
  documentType: "",
  sha256: "",
  uri: "",
});
