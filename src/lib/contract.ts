import { getAddress, isAddress, keccak256, toBytes, type Address, type Hex } from "viem";

import { kimchiProvenanceAbi } from "./abi/kimchiProvenance.ts";
import { kimchiProvenanceDeployment } from "./deployment.ts";

export { kimchiProvenanceAbi };

/**
 * Address of the registry.
 *
 * `NEXT_PUBLIC_PROVENANCE_CONTRACT` wins when set, so a different deployment
 * can be pointed at without a rebuild. Otherwise the committed deployment
 * record is used, which means a fresh clone works with no configuration —
 * a public Batch Passport reached by scanning a QR code must not depend on the
 * reader having set an environment variable.
 *
 * `null` only if both are absent or malformed. Never a placeholder address: a
 * zero address would answer "no such batch" for every lookup, which reads like
 * an answer rather than a misconfiguration.
 */
export const PROVENANCE_ADDRESS: Address | null = (() => {
  const fromEnv = process.env.NEXT_PUBLIC_PROVENANCE_CONTRACT?.trim();
  if (fromEnv !== undefined && fromEnv !== "" && isAddress(fromEnv)) {
    return getAddress(fromEnv);
  }

  const recorded = kimchiProvenanceDeployment.address;
  if (isAddress(recorded)) return getAddress(recorded);

  return null;
})();

/**
 * Block the registry was deployed in — the earliest block that can contain any
 * of its events, and so the floor for any log scan.
 */
export const PROVENANCE_DEPLOY_BLOCK: bigint = (() => {
  const fromEnv = process.env.NEXT_PUBLIC_PROVENANCE_DEPLOY_BLOCK?.trim();
  if (fromEnv !== undefined && /^\d+$/.test(fromEnv)) return BigInt(fromEnv);
  return BigInt(kimchiProvenanceDeployment.blockNumber ?? 0);
})();

/** Role identifiers, matching `KimchiProvenance.sol`. */
export const DEFAULT_ADMIN_ROLE: Hex = `0x${"0".repeat(64)}`;
export const VERIFIER_ROLE: Hex = keccak256(toBytes("VERIFIER_ROLE"));
export const PAUSER_ROLE: Hex = keccak256(toBytes("PAUSER_ROLE"));

/** A 32-byte hex string, as it appears in a URL. */
export function isRecordHash(value: string): value is Hex {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

export const ZERO_HASH: Hex = `0x${"0".repeat(64)}`;
