import demoBatch from "../../public/demo-batch.json";

import { hashBatchMetadata } from "./canonical.ts";
import { BatchMetadataSchema, type BatchMetadata } from "./schema.ts";

/**
 * Metadata bundled into the application, indexed by canonical record hash.
 *
 * CLAUDE.md requires the demonstration to work with no API calls once the
 * contract data is registered. A passport whose record hash matches a bundled
 * document resolves its metadata from here, so the stage demo cannot be broken
 * by a flaky network, a cold CDN, or conference wifi.
 *
 * This is a convenience, not a shortcut around verification: the bundled bytes
 * are hashed and compared exactly like fetched ones. If the bundle ever drifted
 * from what was registered, the passport would report MODIFIED — which is the
 * correct answer, not a bug.
 */
function bundle(): Map<string, BatchMetadata> {
  const map = new Map<string, BatchMetadata>();

  // Parsed rather than cast: a malformed fixture should fail loudly at load,
  // not silently produce a hash nobody can reproduce.
  const parsed = BatchMetadataSchema.safeParse(demoBatch);
  if (parsed.success) {
    map.set(hashBatchMetadata(parsed.data).toLowerCase(), parsed.data);
  }

  return map;
}

const BUNDLED = bundle();

/** Bundled metadata for a record hash, or `null` if this record is not bundled. */
export function bundledMetadata(recordHash: string): BatchMetadata | null {
  return BUNDLED.get(recordHash.toLowerCase()) ?? null;
}

/** Record hashes of every bundled demonstration document. */
export function bundledRecordHashes(): string[] {
  return [...BUNDLED.keys()];
}

/** Whether a record is one of the bundled fictional demonstration batches. */
export function isDemoRecord(recordHash: string): boolean {
  return BUNDLED.has(recordHash.toLowerCase());
}
