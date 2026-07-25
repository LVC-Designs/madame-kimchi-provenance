import { z } from "zod";

/**
 * The public batch metadata schema — defined once, here.
 *
 * The admin form, the demo fixture, the verification flow, and every download
 * import this module and the types inferred from it. If a second definition of
 * a batch record ever appears anywhere in this repository, the two will drift,
 * and a drifted schema means two different canonical byte sequences for what a
 * human would call the same record.
 *
 * Two conventions run through the whole file and matter more than they look:
 *
 * 1. Optional means `nullable`, never `.optional()`. In canonical JSON an
 *    omitted key and a `null` key serialize to different bytes, so allowing
 *    both would give one logical record two equally valid hashes. Every field
 *    is always present; absence is spelled `null`.
 *
 * 2. Values that have one meaning must have one spelling. Hashes are lowercase
 *    hex only; instants are UTC `Z` only. `0xAB…` and `0xab…` are the same
 *    hash, and `T00:00:00Z` and `T01:00:00+01:00` are the same moment — but
 *    each pair hashes differently, so exactly one spelling is accepted.
 */

/** Bumped only for a breaking change to the shape below. */
export const SCHEMA_VERSION = 1;

/**
 * Batch lifecycle states.
 *
 * Order is significant: it must match the `BatchStatus` enum in
 * `contracts/KimchiProvenance.sol` index for index, because the contract takes
 * the status as a `uint8`.
 */
export const BATCH_STATUSES = [
  "ACTIVE",
  "QUARANTINED",
  "RECALLED",
  "SUPERSEDED",
] as const;

/**
 * Chain-of-custody event vocabulary.
 *
 * Order is significant, for the same reason as `BATCH_STATUSES`.
 */
export const ATTESTATION_TYPES = [
  "INGREDIENT_RECEIVED",
  "FERMENTATION_STARTED",
  "FERMENTATION_COMPLETED",
  "QUALITY_CHECK",
  "PACKED",
  "SHIPPED",
  "DISTRIBUTOR_RECEIVED",
  "RETAILER_RECEIVED",
  "QUARANTINED",
  "RECALLED",
  "CORRECTION",
] as const;

export type BatchStatus = (typeof BATCH_STATUSES)[number];
export type AttestationType = (typeof ATTESTATION_TYPES)[number];

/** Solidity enum index for a status name. */
export function batchStatusIndex(status: BatchStatus): number {
  return BATCH_STATUSES.indexOf(status);
}

/** Solidity enum index for an attestation type name. */
export function attestationTypeIndex(type: AttestationType): number {
  return ATTESTATION_TYPES.indexOf(type);
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/**
 * A 32-byte hash. Lowercase only — uppercase is rejected rather than folded,
 * so a malformed hash fails loudly instead of silently changing the bytes that
 * get hashed.
 */
export const Hash32 = z
  .string()
  .regex(
    /^0x[0-9a-f]{64}$/,
    "Must be 0x followed by 64 lowercase hexadecimal characters",
  );

/** Calendar date, `YYYY-MM-DD`. Rejects anything carrying a time. */
export const CalendarDate = z.iso.date();

/** Instant in UTC. Offsets such as `+01:00` are rejected; only `Z` is accepted. */
export const Instant = z.iso.datetime();

/**
 * Public URL, or `null` where publication has not been authorized.
 *
 * Restricted to http and https. `z.url()` alone accepts `javascript:`,
 * `data:`, and `file:` — every one of which becomes a live attack the moment a
 * passport renders it into an `href`. Since registered metadata is published to
 * anyone who scans a QR code, the scheme is allow-listed here rather than
 * filtered at the point of display.
 *
 * `isSafeHref` guards the render sites as well: this check stops bad data being
 * registered, but records already on-chain were validated by whatever ran at
 * the time, and an append-only registry cannot take them back.
 */
export const PublicUri = z.union([
  z
    .string()
    .max(2048)
    .refine(isSafeHref, "Must be an http or https URL"),
  z.null(),
]);

/** Whether a string is a URL safe to place in an `href`. */
export function isSafeHref(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

const ShortText = z.string().trim().min(1).max(200);

/**
 * A referenced document. The document itself is never stored on-chain and never
 * committed to this repository — only its digest, and a public location where
 * publication has been authorized.
 */
export const DocumentReferenceSchema = z.strictObject({
  label: ShortText,
  documentType: ShortText,
  /** SHA-256 of the document bytes. */
  sha256: Hash32,
  uri: PublicUri,
});

/**
 * An externally issued certification. Recording a reference is not a claim that
 * the certification is valid, current, or applicable.
 */
export const CertificationReferenceSchema = z.strictObject({
  label: ShortText,
  issuer: ShortText,
  identifier: ShortText,
  uri: PublicUri,
});

/** Public, non-confidential origin summary. Never supplier terms or pricing. */
export const IngredientOriginSchema = z.strictObject({
  ingredient: ShortText,
  originRegion: ShortText,
  originCountry: ShortText,
  note: z.union([z.string().trim().max(500), z.null()]),
});

// ---------------------------------------------------------------------------
// Batch metadata
// ---------------------------------------------------------------------------

const BatchMetadataShape = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),

  batchId: z
    .string()
    .trim()
    .regex(
      /^[A-Z0-9][A-Z0-9-]{2,63}$/,
      "Uppercase letters, digits, and hyphens; 3–64 characters",
    ),

  productName: ShortText,
  productSku: ShortText,
  lotNumber: ShortText,

  productionDate: CalendarDate,
  fermentationStart: Instant,
  /** `null` while a batch is still fermenting. */
  fermentationEnd: z.union([Instant, z.null()]),
  packedDate: CalendarDate,
  bestBeforeDate: CalendarDate,

  ingredientOrigins: z.array(IngredientOriginSchema).max(50),
  /** `null` unless the facility has been approved for public display. */
  facilityName: z.union([ShortText, z.null()]),
  certificationReferences: z.array(CertificationReferenceSchema).max(50),
  documentReferences: z.array(DocumentReferenceSchema).max(50),

  /**
   * Status at the moment of publication. The chain is authoritative for a
   * record's *current* status: a batch registered as ACTIVE and later recalled
   * keeps ACTIVE here, because rewriting it would change the hash and break the
   * very tamper-evidence the record exists to provide.
   */
  status: z.enum(BATCH_STATUSES),

  /** Record this version replaces, or `null` for an original. */
  supersedesRecordHash: z.union([Hash32, z.null()]),

  notes: z.union([z.string().trim().max(2000), z.null()]),

  generatedAt: Instant,
});

/**
 * Cross-field consistency. These catch transcription mistakes, not fraud — an
 * authorized verifier who wants to publish a wrong date can still do so, and
 * the record will faithfully preserve that they did.
 */
export const BatchMetadataSchema = BatchMetadataShape.superRefine((value, ctx) => {
  if (
    value.fermentationEnd !== null &&
    value.fermentationEnd < value.fermentationStart
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["fermentationEnd"],
      message: "Fermentation cannot end before it starts",
    });
  }

  if (value.packedDate < value.productionDate) {
    ctx.addIssue({
      code: "custom",
      path: ["packedDate"],
      message: "Packing cannot precede production",
    });
  }

  if (value.bestBeforeDate <= value.packedDate) {
    ctx.addIssue({
      code: "custom",
      path: ["bestBeforeDate"],
      message: "Best-before must fall after packing",
    });
  }
});

export type BatchMetadata = z.infer<typeof BatchMetadataSchema>;
export type DocumentReference = z.infer<typeof DocumentReferenceSchema>;
export type CertificationReference = z.infer<typeof CertificationReferenceSchema>;
export type IngredientOrigin = z.infer<typeof IngredientOriginSchema>;

// ---------------------------------------------------------------------------
// Attestation metadata
// ---------------------------------------------------------------------------

export const MeasurementSchema = z.strictObject({
  label: ShortText,
  value: ShortText,
  unit: z.union([z.string().trim().max(30), z.null()]),
});

export const AttestationMetadataSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),

  attestationType: z.enum(ATTESTATION_TYPES),

  /** Binds the attestation to its batch inside the hashed bytes, not merely alongside them. */
  batchRecordHash: Hash32,

  /** When the physical event happened — deliberately distinct from the block timestamp. */
  occurredAt: Instant,

  location: z.union([ShortText, z.null()]),
  measurements: z.array(MeasurementSchema).max(50),
  documentReferences: z.array(DocumentReferenceSchema).max(50),

  /** Set only on a CORRECTION; the append-only link to what is being corrected. */
  correctsAttestationHash: z.union([Hash32, z.null()]),

  notes: z.union([z.string().trim().max(2000), z.null()]),

  generatedAt: Instant,
});

export type AttestationMetadata = z.infer<typeof AttestationMetadataSchema>;
export type Measurement = z.infer<typeof MeasurementSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Throws on invalid input. Use where a failure is a programming error. */
export function parseBatchMetadata(value: unknown): BatchMetadata {
  return BatchMetadataSchema.parse(value);
}

/** Non-throwing parse, for user input and uploaded files. */
export function safeParseBatchMetadata(value: unknown) {
  return BatchMetadataSchema.safeParse(value);
}

/** Flattens zod issues into `path → message`, for form display. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "(root)";
    result[key] ??= issue.message;
  }
  return result;
}
