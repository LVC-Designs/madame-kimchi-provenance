import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { network } from "hardhat";

import { batchIdHash, canonicalHash, hashBatchMetadata } from "../src/lib/canonical.ts";
import {
  DEMO_ATTESTATION_SEQUENCE,
  demoStepToAttestation,
} from "../src/lib/demoSequence.ts";
import { kimchiProvenanceDeployment } from "../src/lib/deployment.ts";
import {
  BatchMetadataSchema,
  attestationTypeIndex,
  batchStatusIndex,
} from "../src/lib/schema.ts";

/**
 * Registers the fictional demonstration batch and its chain-of-custody events.
 *
 *     npx hardhat run scripts/seed-demo-batch.ts --network monadTestnet
 *
 * Idempotent: everything already on-chain is skipped, so a partial run can be
 * repeated safely. That matters because the registry rejects duplicates by
 * design, and a seed script that reverted halfway through would otherwise need
 * a fresh batch id to retry.
 *
 * The signing key is resolved by Hardhat's `configVariable`, from the encrypted
 * keystore or the environment. It is never read, logged, or written here.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Read from the committed deployment record rather than `src/lib/contract.ts`.
 *
 * That module resolves its imports through the `@/` bundler alias, which Node
 * does not honour at runtime — importing it here would typecheck cleanly and
 * then fail the moment the script ran.
 */
const PROVENANCE_ADDRESS = (process.env.NEXT_PUBLIC_PROVENANCE_CONTRACT?.trim() ||
  kimchiProvenanceDeployment.address) as `0x${string}` | undefined;

async function main() {
  if (PROVENANCE_ADDRESS === undefined) {
    throw new Error(
      "No registry address. Deploy first, then set NEXT_PUBLIC_PROVENANCE_CONTRACT or export the deployment record.",
    );
  }

  const metadata = BatchMetadataSchema.parse(
    JSON.parse(readFileSync(join(ROOT, "public/demo-batch.json"), "utf8")),
  );

  const recordHash = hashBatchMetadata(metadata);
  const idHash = batchIdHash(metadata.batchId);

  const { viem } = await network.connect({ network: "monadTestnet", chainType: "l1" });
  const publicClient = await viem.getPublicClient();
  const [wallet] = await viem.getWalletClients();

  const registry = await viem.getContractAt("KimchiProvenance", PROVENANCE_ADDRESS);

  console.log(`\n  Registry   ${PROVENANCE_ADDRESS}`);
  console.log(`  Verifier   ${wallet.account.address}`);
  console.log(`  Batch      ${metadata.batchId}`);
  console.log(`  Record     ${recordHash}\n`);

  const verifierRole = await registry.read.VERIFIER_ROLE();
  const authorized = await registry.read.hasRole([verifierRole, wallet.account.address]);
  if (!authorized) {
    throw new Error(
      `${wallet.account.address} does not hold VERIFIER_ROLE on ${PROVENANCE_ADDRESS}.`,
    );
  }
  if (await registry.read.paused()) {
    throw new Error("The registry is paused. Unpause it before seeding.");
  }

  // --- Batch record ------------------------------------------------------
  if (await registry.read.exists([recordHash])) {
    console.log("  · batch already registered, skipping");
  } else {
    const hash = await registry.write.registerBatch([
      recordHash,
      idHash,
      `0x${"0".repeat(64)}`,
      batchStatusIndex(metadata.status),
      `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/demo-batch.json`,
    ]);
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`  ✓ registered batch    ${hash}`);
  }

  // --- Attestations ------------------------------------------------------
  // The same six steps the attestation form offers, from the same module, so a
  // seeded timeline and a hand-clicked one are the identical documents.
  for (const step of DEMO_ATTESTATION_SEQUENCE) {
    const attestationHash = canonicalHash(demoStepToAttestation(step, recordHash));

    if (await registry.read.attestationExists([attestationHash])) {
      console.log(`  \u00b7 ${step.type} already recorded, skipping`);
      continue;
    }

    const hash = await registry.write.addAttestation([
      recordHash,
      attestationHash,
      attestationTypeIndex(step.type),
      "",
    ]);
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`  \u2713 ${step.type.padEnd(24)} ${hash}`);
  }

  const count = await registry.read.attestationCount([recordHash]);
  console.log(`\n  Attestations on record: ${count}`);
  console.log(`  Batch Passport: /trace/${recordHash}\n`);
}

await main();
