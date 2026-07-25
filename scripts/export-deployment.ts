/**
 * Reads a completed Hardhat Ignition deployment off disk and exports the
 * frontend-safe parts of it: the ABI, the contract address, and the deployment
 * receipt details.
 *
 * Run it AFTER `hardhat ignition deploy`:
 *
 *     node scripts/export-deployment.ts [deploymentId]
 *
 * Deliberately a plain Node script rather than a `hardhat run` task. It opens no
 * network connection and reads no account configuration, so there is no code
 * path on which it could obtain a private key, let alone print one. Everything
 * it emits is already public the moment the deployment transaction lands.
 */

import { keccak256, toBytes } from "viem";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const MONAD_TESTNET_CHAIN_ID = 10143;
const MONAD_TESTNET_EXPLORER_URL = "https://testnet.monadscan.com";
const FUTURE_ID = "KimchiProvenanceModule#KimchiProvenance";

const DEPLOYMENT_OUT = join(ROOT, "src/lib/deployment.ts");

// Role identifiers, mirroring KimchiProvenance.sol.
const ROLES = {
  DEFAULT_ADMIN_ROLE: `0x${"0".repeat(64)}`,
  VERIFIER_ROLE: keccak256(toBytes("VERIFIER_ROLE")),
  PAUSER_ROLE: keccak256(toBytes("PAUSER_ROLE")),
} as const;

// keccak256("RoleGranted(bytes32,address,address)")
const ROLE_GRANTED_TOPIC = keccak256(toBytes("RoleGranted(bytes32,address,address)"));

interface JournalEntry {
  type: string;
  futureId?: string;
  from?: string;
  hash?: string;
  receipt?: {
    blockHash: string;
    blockNumber: number;
    contractAddress: string | null;
    logs: Array<{ address: string; topics: string[]; data: string }>;
  };
}

function fail(message: string): never {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

function readJournal(deploymentDir: string): JournalEntry[] {
  let raw: string;
  try {
    raw = readFileSync(join(deploymentDir, "journal.jsonl"), "utf8");
  } catch {
    return fail(
      `No deployment journal at ${deploymentDir}.\n    Deploy first, then re-run this script.`,
    );
  }
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as JournalEntry);
}

/**
 * Refuses to write anything that contains a configured secret.
 *
 * The script never reads a key deliberately, so this is a backstop against a
 * future edit that starts interpolating environment values into the output. It
 * compares only; the value is never logged.
 */
function assertNoSecrets(label: string, content: string): void {
  const secretVarNames = Object.keys(process.env).filter((name) =>
    /(PRIVATE_KEY|SECRET|MNEMONIC|PASSPHRASE|SEED)/i.test(name),
  );

  for (const name of secretVarNames) {
    const value = process.env[name];
    if (value !== undefined && value.length >= 8 && content.includes(value)) {
      fail(`Refusing to write ${label}: it contains the value of ${name}.`);
    }
  }
}

function writeGenerated(path: string, label: string, content: string): void {
  assertNoSecrets(label, content);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function main(): void {
  const deploymentId = process.argv[2] ?? `chain-${MONAD_TESTNET_CHAIN_ID}`;
  const deploymentDir = join(ROOT, "ignition/deployments", deploymentId);

  // --- Address -----------------------------------------------------------
  let addresses: Record<string, string>;
  try {
    addresses = JSON.parse(
      readFileSync(join(deploymentDir, "deployed_addresses.json"), "utf8"),
    ) as Record<string, string>;
  } catch {
    return fail(`No deployed_addresses.json at ${deploymentDir}.`);
  }

  const address = addresses[FUTURE_ID];
  if (address === undefined) {
    return fail(`Deployment ${deploymentId} has no entry for ${FUTURE_ID}.`);
  }

  // --- Receipt details ---------------------------------------------------
  const journal = readJournal(deploymentDir);

  const confirmation = journal.find(
    (entry) => entry.type === "TRANSACTION_CONFIRM" && entry.futureId === FUTURE_ID,
  );
  const initialize = journal.find(
    (entry) =>
      entry.type === "DEPLOYMENT_EXECUTION_STATE_INITIALIZE" && entry.futureId === FUTURE_ID,
  );

  const txHash = confirmation?.hash ?? null;
  const blockNumber = confirmation?.receipt?.blockNumber ?? null;
  const deployer = initialize?.from ?? null;

  // --- Verify the deployer really holds all three roles ------------------
  const grantedRoles = new Set(
    (confirmation?.receipt?.logs ?? [])
      .filter(
        (log) =>
          log.address.toLowerCase() === address.toLowerCase() &&
          log.topics[0]?.toLowerCase() === ROLE_GRANTED_TOPIC.toLowerCase(),
      )
      .map((log) => log.topics[1]?.toLowerCase()),
  );

  const roleReport = Object.entries(ROLES).map(([name, id]) => ({
    name,
    granted: grantedRoles.has(id.toLowerCase()),
  }));
  const allRolesGranted = roleReport.every((role) => role.granted);

  // --- Write generated file ----------------------------------------------
  // The ABI is not written here: it belongs to the compiled contract rather
  // than to any deployment, and `scripts/export-abi.ts` owns that file.
  writeGenerated(
    DEPLOYMENT_OUT,
    "src/lib/deployment.ts",
    `// Generated by scripts/export-deployment.ts. Do not edit by hand.
//
// Deployment record for the Madame Kimchi batch provenance registry.
// Every value here is public on-chain data. No secret is ever written here.

export const kimchiProvenanceDeployment = {
  /** Monad Testnet. */
  chainId: ${MONAD_TESTNET_CHAIN_ID},
  /** Deployed contract address. */
  address: ${JSON.stringify(address)},
  /** Transaction that created the contract. */
  deploymentTxHash: ${JSON.stringify(txHash)},
  /** Block the deployment landed in; a sensible \`fromBlock\` for log queries. */
  blockNumber: ${JSON.stringify(blockNumber)},
  /** Address seated as admin, verifier, and pauser by the constructor. */
  deployer: ${JSON.stringify(deployer)},
  /** Ignition deployment this record came from. */
  deploymentId: ${JSON.stringify(deploymentId)},
} as const;
`,
  );

  // --- Report ------------------------------------------------------------
  const explorerAddress = `${MONAD_TESTNET_EXPLORER_URL}/address/${address}`;
  const explorerTx = txHash === null ? null : `${MONAD_TESTNET_EXPLORER_URL}/tx/${txHash}`;

  console.log(`
  Madame Kimchi — Batch Provenance Protocol
  Deployment "${deploymentId}"

  Contract address   ${address}
  Transaction hash   ${txHash ?? "(not recorded in journal)"}
  Block number       ${blockNumber ?? "(not recorded in journal)"}
  Deployer / admin   ${deployer ?? "(not recorded in journal)"}

  Explorer (address) ${explorerAddress}
  Explorer (tx)      ${explorerTx ?? "(unavailable)"}

  Roles granted at construction:
${roleReport.map((role) => `    ${role.granted ? "✓" : "✗"} ${role.name}`).join("\n")}
${
  allRolesGranted
    ? ""
    : "\n  ⚠ Not every role was granted in the deployment transaction. Investigate before use.\n"
}
  Exported:
    src/lib/deployment.ts

  Add this to .env.local so the browser targets the deployment:
    NEXT_PUBLIC_PROVENANCE_CONTRACT=${address}
`);

  if (!allRolesGranted) process.exit(1);
}

main();
