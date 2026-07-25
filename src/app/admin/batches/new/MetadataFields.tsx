"use client";

import {
  RepeatableGroup,
  RepeatableRow,
  SelectField,
  TextArea,
  TextField,
} from "@/components/FormControls";
import type { BatchStatus } from "@/lib/schema";

import {
  emptyCertification,
  emptyDocument,
  emptyOrigin,
  type BatchDraft,
} from "./draft";

/**
 * Only ACTIVE and QUARANTINED are offered.
 *
 * The contract refuses to register a record directly as RECALLED so that every
 * recall arrives through `updateBatchStatus` carrying a reason, and SUPERSEDED
 * is set by the contract itself when a newer version replaces this one. Offering
 * either here would produce a transaction that can only revert.
 */
const STATUS_OPTIONS = [
  { value: "ACTIVE" as BatchStatus, label: "ACTIVE" },
  { value: "QUARANTINED" as BatchStatus, label: "QUARANTINED" },
];

export function MetadataFields({
  draft,
  errors,
  onChange,
}: {
  draft: BatchDraft;
  errors: Record<string, string>;
  onChange: (next: BatchDraft) => void;
}) {
  const set = <K extends keyof BatchDraft>(key: K, value: BatchDraft[K]) =>
    onChange({ ...draft, [key]: value });

  return (
    <div className="flex flex-col gap-8">
      {/* ---------------------------------------------------------------- */}
      <section className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Batch ID"
          value={draft.batchId}
          onChange={(value) => set("batchId", value)}
          error={errors.batchId}
          hint="Uppercase letters, digits, hyphens."
          mono
        />
        <TextField
          label="Lot number"
          value={draft.lotNumber}
          onChange={(value) => set("lotNumber", value)}
          error={errors.lotNumber}
          mono
        />
        <TextField
          label="Product name"
          value={draft.productName}
          onChange={(value) => set("productName", value)}
          error={errors.productName}
        />
        <TextField
          label="Product SKU"
          value={draft.productSku}
          onChange={(value) => set("productSku", value)}
          error={errors.productSku}
          mono
        />
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Production date"
          type="date"
          value={draft.productionDate}
          onChange={(value) => set("productionDate", value)}
          error={errors.productionDate}
        />
        <TextField
          label="Packed date"
          type="date"
          value={draft.packedDate}
          onChange={(value) => set("packedDate", value)}
          error={errors.packedDate}
        />
        <TextField
          label="Fermentation start (UTC)"
          type="datetime-local"
          value={draft.fermentationStart}
          onChange={(value) => set("fermentationStart", value)}
          error={errors.fermentationStart}
          hint="Entered and recorded as UTC."
        />
        <TextField
          label="Fermentation end (UTC)"
          type="datetime-local"
          value={draft.fermentationEnd}
          onChange={(value) => set("fermentationEnd", value)}
          error={errors.fermentationEnd}
          hint="Leave blank while still fermenting."
        />
        <TextField
          label="Best before"
          type="date"
          value={draft.bestBeforeDate}
          onChange={(value) => set("bestBeforeDate", value)}
          error={errors.bestBeforeDate}
        />
        <SelectField
          label="Status at publication"
          value={draft.status}
          options={STATUS_OPTIONS}
          onChange={(value) => set("status", value)}
          error={errors.status}
          hint="A recall is applied later, with a reason."
        />
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="grid gap-4">
        <TextField
          label="Facility name"
          value={draft.facilityName}
          onChange={(value) => set("facilityName", value)}
          error={errors.facilityName}
          hint="Only if approved for public display. Never an exact private address."
        />
        <TextField
          label="Supersedes record hash"
          value={draft.supersedesRecordHash}
          onChange={(value) => set("supersedesRecordHash", value)}
          error={errors.supersedesRecordHash}
          placeholder="0x… (leave blank for an original record)"
          hint="Set only when publishing a correction. The superseded record stays readable."
          mono
        />
      </section>

      {/* ---------------------------------------------------------------- */}
      <RepeatableGroup
        title="Ingredient origins"
        hint="Public, non-confidential summaries only. Never supplier terms or pricing."
        addLabel="Add ingredient"
        empty={draft.ingredientOrigins.length === 0}
        onAdd={() =>
          set("ingredientOrigins", [...draft.ingredientOrigins, emptyOrigin()])
        }
      >
        {draft.ingredientOrigins.map((origin, index) => (
          <RepeatableRow
            key={index}
            index={index}
            onRemove={() =>
              set(
                "ingredientOrigins",
                draft.ingredientOrigins.filter((_, i) => i !== index),
              )
            }
          >
            <TextField
              label="Ingredient"
              value={origin.ingredient}
              error={errors[`ingredientOrigins.${index}.ingredient`]}
              onChange={(value) =>
                set(
                  "ingredientOrigins",
                  draft.ingredientOrigins.map((item, i) =>
                    i === index ? { ...item, ingredient: value } : item,
                  ),
                )
              }
            />
            <TextField
              label="Region"
              value={origin.originRegion}
              error={errors[`ingredientOrigins.${index}.originRegion`]}
              onChange={(value) =>
                set(
                  "ingredientOrigins",
                  draft.ingredientOrigins.map((item, i) =>
                    i === index ? { ...item, originRegion: value } : item,
                  ),
                )
              }
            />
            <TextField
              label="Country"
              value={origin.originCountry}
              error={errors[`ingredientOrigins.${index}.originCountry`]}
              onChange={(value) =>
                set(
                  "ingredientOrigins",
                  draft.ingredientOrigins.map((item, i) =>
                    i === index ? { ...item, originCountry: value } : item,
                  ),
                )
              }
            />
            <TextField
              label="Note"
              value={origin.note}
              error={errors[`ingredientOrigins.${index}.note`]}
              onChange={(value) =>
                set(
                  "ingredientOrigins",
                  draft.ingredientOrigins.map((item, i) =>
                    i === index ? { ...item, note: value } : item,
                  ),
                )
              }
            />
          </RepeatableRow>
        ))}
      </RepeatableGroup>

      {/* ---------------------------------------------------------------- */}
      <RepeatableGroup
        title="Certification references"
        hint="A reference is not a claim that the certification is valid, current, or applicable."
        addLabel="Add certification"
        empty={draft.certificationReferences.length === 0}
        onAdd={() =>
          set("certificationReferences", [
            ...draft.certificationReferences,
            emptyCertification(),
          ])
        }
      >
        {draft.certificationReferences.map((certification, index) => (
          <RepeatableRow
            key={index}
            index={index}
            onRemove={() =>
              set(
                "certificationReferences",
                draft.certificationReferences.filter((_, i) => i !== index),
              )
            }
          >
            <TextField
              label="Label"
              value={certification.label}
              error={errors[`certificationReferences.${index}.label`]}
              onChange={(value) =>
                set(
                  "certificationReferences",
                  draft.certificationReferences.map((item, i) =>
                    i === index ? { ...item, label: value } : item,
                  ),
                )
              }
            />
            <TextField
              label="Issuer"
              value={certification.issuer}
              error={errors[`certificationReferences.${index}.issuer`]}
              onChange={(value) =>
                set(
                  "certificationReferences",
                  draft.certificationReferences.map((item, i) =>
                    i === index ? { ...item, issuer: value } : item,
                  ),
                )
              }
            />
            <TextField
              label="Identifier"
              value={certification.identifier}
              error={errors[`certificationReferences.${index}.identifier`]}
              mono
              onChange={(value) =>
                set(
                  "certificationReferences",
                  draft.certificationReferences.map((item, i) =>
                    i === index ? { ...item, identifier: value } : item,
                  ),
                )
              }
            />
            <TextField
              label="Public URI"
              value={certification.uri}
              error={errors[`certificationReferences.${index}.uri`]}
              placeholder="Blank unless publication is authorized"
              onChange={(value) =>
                set(
                  "certificationReferences",
                  draft.certificationReferences.map((item, i) =>
                    i === index ? { ...item, uri: value } : item,
                  ),
                )
              }
            />
          </RepeatableRow>
        ))}
      </RepeatableGroup>

      {/* ---------------------------------------------------------------- */}
      <RepeatableGroup
        title="Document references"
        hint="Documents themselves are never stored on-chain. Only a SHA-256 digest, and a public URI where publication is authorized."
        addLabel="Add document"
        empty={draft.documentReferences.length === 0}
        onAdd={() =>
          set("documentReferences", [...draft.documentReferences, emptyDocument()])
        }
      >
        {draft.documentReferences.map((document, index) => (
          <RepeatableRow
            key={index}
            index={index}
            onRemove={() =>
              set(
                "documentReferences",
                draft.documentReferences.filter((_, i) => i !== index),
              )
            }
          >
            <TextField
              label="Label"
              value={document.label}
              error={errors[`documentReferences.${index}.label`]}
              onChange={(value) =>
                set(
                  "documentReferences",
                  draft.documentReferences.map((item, i) =>
                    i === index ? { ...item, label: value } : item,
                  ),
                )
              }
            />
            <TextField
              label="Document type"
              value={document.documentType}
              error={errors[`documentReferences.${index}.documentType`]}
              mono
              onChange={(value) =>
                set(
                  "documentReferences",
                  draft.documentReferences.map((item, i) =>
                    i === index ? { ...item, documentType: value } : item,
                  ),
                )
              }
            />
            <TextField
              label="SHA-256"
              value={document.sha256}
              error={errors[`documentReferences.${index}.sha256`]}
              placeholder="0x… 64 lowercase hex"
              mono
              onChange={(value) =>
                set(
                  "documentReferences",
                  draft.documentReferences.map((item, i) =>
                    i === index ? { ...item, sha256: value } : item,
                  ),
                )
              }
            />
            <TextField
              label="Public URI"
              value={document.uri}
              error={errors[`documentReferences.${index}.uri`]}
              placeholder="Blank unless publication is authorized"
              onChange={(value) =>
                set(
                  "documentReferences",
                  draft.documentReferences.map((item, i) =>
                    i === index ? { ...item, uri: value } : item,
                  ),
                )
              }
            />
          </RepeatableRow>
        ))}
      </RepeatableGroup>

      {/* ---------------------------------------------------------------- */}
      <TextArea
        label="Notes"
        value={draft.notes}
        onChange={(value) => set("notes", value)}
        error={errors.notes}
        hint="Public. No personal information, pricing, or private supplier terms."
        rows={5}
      />
    </div>
  );
}
