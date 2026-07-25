import type { Hex } from "viem";

import { batchIdHash, canonicalize, hashBatchMetadata, parseCanonicalJson } from "./canonical.ts";
import { ZERO_HASH } from "./contract.ts";
import { BatchMetadataSchema, type BatchMetadata } from "./schema.ts";

/**
 * Independent verification of a local document against the Monad record.
 *
 * Everything here is pure. The file is read, validated, canonicalized, and
 * hashed on the client; the only thing the chain contributes is a yes/no on
 * whether a hash is registered. That is the whole point — a check that
 * depended on this site's say-so would be no better than trusting the private
 * database it exists to replace.
 */

export type VerificationOutcome =
  /** Local document hashes to a record registered on Monad. */
  | "VERIFIED"
  /** As VERIFIED, but a newer version has replaced that record. */
  | "SUPERSEDED"
  /** The batch is registered, but this document is not the registered bytes. */
  | "MODIFIED"
  /** Not JSON, or does not satisfy the batch metadata schema. */
  | "INVALID_FORMAT"
  /** Nothing for this batch has ever been registered. */
  | "NOT_REGISTERED";

export interface CandidateAccepted {
  ok: true;
  metadata: BatchMetadata;
  canonicalJson: string;
  /** keccak256 over the canonical form — the record hash this document claims. */
  recordHash: Hex;
  batchIdHashValue: Hex;
}

export interface CandidateRejected {
  ok: false;
  outcome: "INVALID_FORMAT";
  summary: string;
  issues: { path: string; message: string }[];
}

export type CandidateResult = CandidateAccepted | CandidateRejected;

/**
 * Reads a local document: parse, validate, canonicalize, hash.
 *
 * A document that fails the schema is INVALID_FORMAT rather than MODIFIED. It
 * cannot be canonicalized, so no hash was ever computed and no comparison ever
 * happened — reporting a mismatch would assert something that was not tested.
 */
export function readCandidate(text: string): CandidateResult {
  if (text.trim() === "") {
    return {
      ok: false,
      outcome: "INVALID_FORMAT",
      summary: "Nothing to check yet. Upload or paste a batch metadata document.",
      issues: [],
    };
  }

  let parsed: unknown;
  try {
    parsed = parseCanonicalJson(text);
  } catch (error) {
    return {
      ok: false,
      outcome: "INVALID_FORMAT",
      summary: "This is not valid JSON, so it cannot be canonicalized or hashed.",
      issues: [
        { path: "(document)", message: error instanceof Error ? error.message : String(error) },
      ],
    };
  }

  const result = BatchMetadataSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      outcome: "INVALID_FORMAT",
      summary:
        "This JSON does not match the batch metadata schema, so it cannot be canonicalized into the exact bytes a hash is taken over.",
      issues: result.error.issues.slice(0, 25).map((issue) => ({
        path: issue.path.join(".") || "(root)",
        message: issue.message,
      })),
    };
  }

  return {
    ok: true,
    metadata: result.data,
    canonicalJson: canonicalize(result.data),
    recordHash: hashBatchMetadata(result.data),
    batchIdHashValue: batchIdHash(result.data.batchId),
  };
}

export interface ChainFacts {
  /** Whether the document's own hash is registered. */
  candidateRegistered: boolean;
  /** Forward link on that record, when it is registered. */
  supersededBy: Hex | null;
  /** How many versions exist under this document's batch id. */
  batchVersionCount: number;
}

/**
 * The verdict, given the document's hash and what the chain says about it.
 *
 * Separated from the component so it can be exercised without a network, and so
 * the branch that decides MODIFIED versus NOT_REGISTERED is written down once.
 *
 * The distinction matters: a document whose hash is unknown is only evidence of
 * modification if *something* under that batch id was registered. If nothing
 * ever was, the honest answer is that this batch is not in the registry — not
 * that the file was altered.
 */
export function decideOutcome(facts: ChainFacts): VerificationOutcome {
  if (facts.candidateRegistered) {
    const superseded = facts.supersededBy !== null && facts.supersededBy !== ZERO_HASH;
    return superseded ? "SUPERSEDED" : "VERIFIED";
  }

  return facts.batchVersionCount > 0 ? "MODIFIED" : "NOT_REGISTERED";
}

/** Headline and explanation for each outcome. Wording is load-bearing. */
export const OUTCOME_COPY: Record<
  VerificationOutcome,
  { title: string; body: string; tone: "verified" | "warning" | "failed" | "neutral" }
> = {
  VERIFIED: {
    title: "Verified against the Monad record",
    body: "This document hashes to exactly the value registered on Monad Testnet, so it has not changed since it was registered. That is a statement about the bytes, not about whether their contents are true.",
    tone: "verified",
  },
  SUPERSEDED: {
    title: "Verified — but superseded",
    body: "This document matches a record registered on Monad Testnet, and that record has since been replaced by a newer version. The record you are holding is authentic and unchanged; it is simply no longer the current one.",
    tone: "warning",
  },
  MODIFIED: {
    title: "Modified — differs from the registered version",
    body: "This batch is registered on Monad Testnet, but this file is not the document that was registered. Something in it differs. That may be entirely innocent — an older copy, or a tool that rewrote the file on save — and nothing here establishes who changed it, when, or why.",
    tone: "failed",
  },
  INVALID_FORMAT: {
    title: "Invalid format",
    body: "This document cannot be read as batch metadata, so it cannot be canonicalized and no hash could be computed. Nothing has been compared.",
    tone: "neutral",
  },
  NOT_REGISTERED: {
    title: "Not registered",
    body: "No record for this batch has been found on Monad Testnet. The document may be valid but never registered, or it may belong to a different registry.",
    tone: "neutral",
  },
};
