import { hashBatchMetadata } from "./canonical.ts";
import { bundledMetadata } from "./fixtures.ts";
import { BatchMetadataSchema, BATCH_STATUSES, type BatchMetadata, type BatchStatus } from "./schema.ts";

/**
 * The two independent questions a Batch Passport answers.
 *
 * They are deliberately kept apart. "Is this record still the bytes that were
 * registered?" is a cryptographic question with a definite answer. "What has
 * happened to this batch since?" is a lifecycle question decided by authorized
 * verifiers. Collapsing them into one badge would let a green tick imply the
 * product is fine when the record merely hashes correctly — and a recalled
 * batch's record hashes correctly right up until someone edits it.
 */

/** Result of re-hashing the published document against the on-chain record. */
export type IntegrityState =
  | "CHECKING"
  /** Document loaded and its canonical hash equals the record hash. */
  | "HASH_VERIFIED"
  /** Document loaded but its canonical hash differs. */
  | "MODIFIED"
  /** No published document to check: no URI, or it could not be loaded. */
  | "METADATA_UNAVAILABLE";

export type MetadataSource = "bundled" | "fetched" | "none";

export interface MetadataResolution {
  metadata: BatchMetadata | null;
  source: MetadataSource;
  integrity: IntegrityState;
  /** Hash actually computed from the loaded document, when there was one. */
  computedHash: string | null;
  /** Why the document could not be used, when it could not. */
  reason: string | null;
}

/**
 * Resolves the published metadata for a record and checks it against the chain.
 *
 * Bundled documents are preferred when one hashes to this record. That keeps
 * the stage demonstration working with no network at all, as CLAUDE.md
 * requires, and costs nothing in rigour: a bundled document is only used when
 * its canonical hash already equals the record hash, which is the same test a
 * fetched document has to pass.
 */
export async function resolveMetadata(
  recordHash: string,
  metadataURI: string,
): Promise<MetadataResolution> {
  const bundled = bundledMetadata(recordHash);
  if (bundled !== null) {
    return {
      metadata: bundled,
      source: "bundled",
      integrity: "HASH_VERIFIED",
      computedHash: hashBatchMetadata(bundled),
      reason: null,
    };
  }

  if (metadataURI.trim() === "") {
    return {
      metadata: null,
      source: "none",
      integrity: "METADATA_UNAVAILABLE",
      computedHash: null,
      reason:
        "This record was registered as a hash alone. No public metadata URI was published, so there is no document to compare.",
    };
  }

  let text: string;
  try {
    const response = await fetch(metadataURI, { redirect: "follow" });
    if (!response.ok) {
      return unavailable(`The metadata URI responded ${response.status}.`);
    }
    text = await response.text();
  } catch {
    return unavailable(
      "The metadata URI could not be reached. It may be offline, or blocked by cross-origin policy.",
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return unavailable("The metadata URI did not return valid JSON.");
  }

  const parsed = BatchMetadataSchema.safeParse(parsedJson);
  if (!parsed.success) {
    // A document that does not fit the schema cannot be canonicalized, so its
    // hash cannot be compared. That is unavailability, not tampering — saying
    // MODIFIED here would accuse someone of something not demonstrated.
    return unavailable(
      "The published document does not match the batch metadata schema, so it cannot be canonicalized or compared.",
    );
  }

  const computedHash = hashBatchMetadata(parsed.data);
  const matches = computedHash.toLowerCase() === recordHash.toLowerCase();

  return {
    metadata: parsed.data,
    source: "fetched",
    integrity: matches ? "HASH_VERIFIED" : "MODIFIED",
    computedHash,
    reason: matches
      ? null
      : "The published document does not hash to the value registered on Monad. It has changed since registration, or this is not the document that was registered.",
  };
}

function unavailable(reason: string): MetadataResolution {
  return {
    metadata: null,
    source: "none",
    integrity: "METADATA_UNAVAILABLE",
    computedHash: null,
    reason,
  };
}

/** Maps the contract's `uint8` status to its name. */
export function statusName(index: number): BatchStatus {
  return BATCH_STATUSES[index] ?? "ACTIVE";
}

/** Statuses that demand prominent display rather than a quiet badge. */
export function isAlarmingStatus(status: BatchStatus): boolean {
  return status === "QUARANTINED" || status === "RECALLED";
}

/** Formats an on-chain `uint64` timestamp deterministically, in UTC. */
export function formatChainTime(seconds: bigint): string {
  const date = new Date(Number(seconds) * 1000);
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}
