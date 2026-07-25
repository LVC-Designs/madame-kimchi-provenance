import { keccak256, toBytes, type Hex } from "viem";

import type { AttestationMetadata, BatchMetadata } from "./schema.ts";

/**
 * Canonical JSON serialization and hashing.
 *
 * Every hash in this application is produced here. Nothing else in the codebase
 * may call `keccak256` on record data: the guarantee the product makes is that
 * a published record and an on-chain hash correspond, and that guarantee only
 * holds if exactly one function decides what bytes a record is.
 *
 * The rules, in the order they are applied to every string (keys included):
 *
 *   1. CRLF and lone CR become LF. A file that has been through a Windows
 *      editor must hash the same as one that has not.
 *   2. Unicode NFC. `김치` typed as precomposed syllables and as decomposed
 *      jamo are the same word to a reader and must be the same bytes to us.
 *
 * Then, structurally:
 *
 *   3. Object keys sorted by UTF-16 code unit, recursively (RFC 8785 / JCS).
 *   4. Array order preserved — order is semantic in a timeline.
 *   5. No insignificant whitespace.
 *   6. A numeric `schemaVersion` is required at the top level.
 *
 * This module is isomorphic: viem's keccak256 is pure JavaScript, so the
 * browser computing a hash over a local file gets the identical answer to the
 * script that registered it. That is what makes `/verify` independent of us.
 */

/** Only bumped alongside a change to the rules above. */
export const CANONICALIZATION_VERSION = 1;

/** Normalizes line endings, then Unicode form. Applied to keys and values alike. */
function normalizeString(value: string): string {
  return value.replace(/\r\n?/g, "\n").normalize("NFC");
}

function canonicalizeValue(value: unknown, path: string): unknown {
  if (value === null) return null;

  switch (typeof value) {
    case "string":
      return normalizeString(value);

    case "boolean":
      return value;

    case "number":
      if (!Number.isFinite(value)) {
        throw new CanonicalizationError(
          `Non-finite number at ${path}. NaN and Infinity have no JSON representation.`,
        );
      }
      return value;

    case "bigint":
      throw new CanonicalizationError(
        `BigInt at ${path}. Represent large values as strings so their encoding is explicit.`,
      );

    case "undefined":
      throw new CanonicalizationError(
        `undefined at ${path}. Absence must be spelled null so it has stable bytes.`,
      );

    case "function":
    case "symbol":
      throw new CanonicalizationError(`${typeof value} at ${path} is not serializable.`);
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalizeValue(item, `${path}[${index}]`));
  }

  if (value instanceof Date) {
    throw new CanonicalizationError(
      `Date object at ${path}. Pass an ISO 8601 string so the timezone is explicit in the bytes.`,
    );
  }

  const source = value as Record<string, unknown>;
  const normalizedKeys = new Map<string, string>();

  for (const key of Object.keys(source)) {
    const normalized = normalizeString(key);
    const existing = normalizedKeys.get(normalized);
    if (existing !== undefined) {
      // Two distinct keys that normalize to one key would silently drop data.
      throw new CanonicalizationError(
        `Keys ${JSON.stringify(existing)} and ${JSON.stringify(key)} at ${path} collide after Unicode normalization.`,
      );
    }
    normalizedKeys.set(normalized, key);
  }

  const result: Record<string, unknown> = {};
  // Default sort is UTF-16 code unit order, which is what JCS specifies.
  for (const normalized of [...normalizedKeys.keys()].sort()) {
    const originalKey = normalizedKeys.get(normalized) as string;
    result[normalized] = canonicalizeValue(
      source[originalKey],
      path === "$" ? `$.${normalized}` : `${path}.${normalized}`,
    );
  }

  return result;
}

/** Raised when a value cannot be represented as canonical JSON. */
export class CanonicalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalizationError";
  }
}

/**
 * Serializes a value to its one canonical JSON representation.
 *
 * @throws {CanonicalizationError} if the value is not representable, or if
 * `schemaVersion` is missing — an unversioned record cannot be safely compared
 * against a hash produced under unknown rules.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new CanonicalizationError("Canonical records must be JSON objects.");
  }

  const schemaVersion = (value as Record<string, unknown>).schemaVersion;
  if (typeof schemaVersion !== "number" || !Number.isInteger(schemaVersion)) {
    throw new CanonicalizationError(
      "Canonical records require an integer schemaVersion at the top level.",
    );
  }

  return JSON.stringify(canonicalizeValue(value, "$"));
}

/** keccak256 over the UTF-8 bytes of the canonical form. */
export function canonicalHash(value: unknown): Hex {
  return keccak256(toBytes(canonicalize(value)));
}

/**
 * The record hash of a batch.
 *
 * By design this is exactly the hash of the canonical metadata: the record's
 * identity IS its content hash, which is why verifying a downloaded file is a
 * single lookup with no derivation step for anyone to reproduce or get wrong.
 */
export function hashBatchMetadata(metadata: BatchMetadata): Hex {
  return canonicalHash(metadata);
}

/** The attestation hash. Same identity rule as `hashBatchMetadata`. */
export function hashAttestationMetadata(metadata: AttestationMetadata): Hex {
  return canonicalHash(metadata);
}

/**
 * The contract's lookup key for a batch, grouping every version of it.
 *
 * Hashed over the NFC-normalized id alone — not canonical JSON — because it
 * identifies a batch rather than a document.
 */
export function batchIdHash(batchId: string): Hex {
  return keccak256(toBytes(normalizeString(batchId)));
}

/**
 * Parses JSON text that may carry a byte-order mark.
 *
 * Indentation and trailing newlines need no special handling: they are
 * insignificant to the parser and vanish here. Line endings *inside* string
 * values are the case that genuinely needs normalizing, and `canonicalize`
 * handles those.
 */
export function parseCanonicalJson(text: string): unknown {
  return JSON.parse(text.replace(/^﻿/, ""));
}

/**
 * The exact bytes that were hashed, as a downloadable file.
 *
 * Canonical rather than pretty-printed, so what a verifier receives is
 * precisely what was measured. Re-indenting it later will not change its hash —
 * that is the point of canonicalization, and it is what makes the tamper
 * demonstration honest rather than a formatting trick.
 */
export function toCanonicalDownload(metadata: BatchMetadata): {
  filename: string;
  contents: string;
  mimeType: string;
} {
  return {
    filename: `${metadata.batchId}.canonical.json`,
    contents: canonicalize(metadata),
    mimeType: "application/json",
  };
}
