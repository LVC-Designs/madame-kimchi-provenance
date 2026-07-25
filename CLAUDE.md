# Madame Kimchi — Batch Provenance Protocol

A testnet prototype for **verifiable kimchi batch provenance on Monad**.

The product is not a token migration. It is a public, tamper-evident record
connecting a physical Madame Kimchi product batch to the claims, documents,
and authorized attestations published about that batch.

Target website: `madamekimchi.global`

---

## Product claim

We are **not** claiming that blockchain proves food safety, product quality,
or the truth of an uploaded document.

We are claiming:

> An authorized verifier registered this exact batch record or attestation at
> this time; the published record has not changed; and anyone can independently
> check the record without trusting Madame Kimchi's private database.

Every architectural decision must serve that sentence.

---

## Strategic scope lock

The source-document review identified unresolved legal, commercial, charitable,
and tokenomics issues. This repository must not recreate those issues.

### Do not build or imply

- A new XMKIM token on Monad
- Transaction taxes
- Token burns
- Staking, yield, APR, or liquidity rewards
- A bridge from XPR
- DAO governance
- Food-bank contribution claims without a signed partner and approved language
- "Meals funded" metrics without documented methodology and evidence
- Merchant, distributor, retailer, charitable, or technology partnerships that
  are not supported by written agreements
- Mainnet production readiness
- Legal, audit, food-safety, or regulatory approval

This is a **Monad Testnet demonstration** until the legal and commercial
validation gates are satisfied.

---

## Core experience

1. An authorized producer creates a batch record.
2. The application canonicalizes the public batch metadata and calculates a
   `keccak256` hash.
3. The hash, metadata URI, issuer, status, and timestamp are registered on
   Monad Testnet.
4. Authorized participants append chain-of-custody attestations:
   ingredient received, fermentation started, quality check, packed, shipped,
   distributor received, retailer received, or recall notice.
5. A QR code on the demo jar or label opens the public Batch Passport.
6. Anyone can inspect the timeline, verify the metadata hash, and open every
   transaction on the block explorer.
7. Corrections are append-only. A new version supersedes the old record; the
   original record remains visible.

---

## Demo story

The stage demonstration should be understandable without explaining Web3:

1. Create a demo batch.
2. Register it on Monad.
3. Scan its QR code.
4. Show the public fermentation and chain-of-custody timeline.
5. Download the batch metadata.
6. Change one field.
7. Re-verify and show `MODIFIED`.
8. Restore the original file and show `VERIFIED`.

The QR Batch Passport and the tamper-detection moment are the centerpiece.

---

## Non-negotiables

### Hashing and schemas

- All canonicalization and hashing goes through `lib/canonical.ts`.
- Never hash inline in components, API routes, or contract helpers.
- Use `keccak256` over canonical JSON.
- Canonical JSON requirements:
  - recursive key sorting;
  - no insignificant whitespace;
  - strings normalized to Unicode NFC;
  - `\n` line endings;
  - a required numeric `schemaVersion`.
- The public metadata schema is defined once in `lib/schema.ts` with zod.
- The admin form, fixtures, verification flow, and downloads all import the
  same schema and inferred TypeScript type.
- Hashes must be computed client-side when verifying a local file.

### Evidence boundaries

- Raw supplier documents, certificates, invoices, and test reports are not
  stored on-chain.
- Public metadata may include a hash and a public URI only when publication is
  authorized.
- No personal information, confidential pricing, private supplier terms,
  exact private facility details, seed phrases, private keys, or credentials
  may be stored on-chain or committed to Git.
- The interface must distinguish:
  - `Registered by an authorized verifier`
  - `Cryptographically unchanged`
  - `Not independently validated for truth or food safety`

### Record integrity

- Records are append-only.
- Existing hashes are never overwritten.
- Corrections create a new version with `supersedesRecordHash`.
- Recall and quarantine status changes are emitted as permanent events.
- Duplicate record hashes and duplicate attestation hashes are rejected.
- Every state-changing function has tests.

### Access control

Use distinct roles:

- `DEFAULT_ADMIN_ROLE`
- `VERIFIER_ROLE`
- `PAUSER_ROLE`

The prototype deployer may hold the roles on testnet. Production design must
allow administration to move to a multisig. Do not implement token governance.

---

## Public batch metadata schema

The exact schema lives in `lib/schema.ts`, but it must represent:

- `schemaVersion`
- `batchId`
- `productName`
- `productSku`
- `lotNumber`
- `productionDate`
- `fermentationStart`
- `fermentationEnd`
- `packedDate`
- `bestBeforeDate`
- `ingredientOrigins` — public, non-confidential summaries only
- `facilityName` — only if approved for public display
- `certificationReferences`
- `documentReferences` — label, type, hash, optional public URI
- `status`
- `supersedesRecordHash` — optional
- `notes`
- `generatedAt`

Dates must use ISO 8601 strings. The schema must reject unknown status values
and malformed hashes.

---

## Attestation types

Use a fixed enum or tightly controlled identifier set:

- `INGREDIENT_RECEIVED`
- `FERMENTATION_STARTED`
- `FERMENTATION_COMPLETED`
- `QUALITY_CHECK`
- `PACKED`
- `SHIPPED`
- `DISTRIBUTOR_RECEIVED`
- `RETAILER_RECEIVED`
- `QUARANTINED`
- `RECALLED`
- `CORRECTION`

Each attestation binds:

- batch record hash;
- attestation type;
- attestation data hash;
- optional public metadata URI;
- verifier wallet;
- timestamp.

Do not allow free-form contract execution or arbitrary external calls.

---

## Smart contract architecture

Prefer one readable MVP contract: `KimchiProvenance.sol`.

### Required capabilities

- `registerBatch(...)`
- `addAttestation(...)`
- `updateBatchStatus(...)`
- `exists(bytes32 recordHash)`
- `getBatch(bytes32 recordHash)`
- public events sufficient to rebuild the timeline from logs
- duplicate rejection
- pause/unpause
- role management
- custom errors
- NatSpec
- no upgradeable proxy
- no token or payment logic

### Suggested record

```solidity
struct BatchRecord {
    bytes32 recordHash;
    bytes32 batchIdHash;
    bytes32 metadataHash;
    bytes32 supersedesRecordHash;
    string metadataURI;
    address issuer;
    uint64 createdAt;
    BatchStatus status;
}
```

Use events for the append-only attestation timeline.

---

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- zod
- wagmi
- viem
- TanStack Query
- Hardhat 3
- Solidity `0.8.28`
- Hardhat compiler setting `evmVersion: "prague"`
- Monad Testnet
  - Chain ID: `10143`
  - RPC: `https://testnet-rpc.monad.xyz`
  - Explorer: `https://testnet.monadscan.com`
  - Currency: `MON`

Secrets belong in `.env` or `.env.local`, both excluded by Git. Never expose
a private key with `NEXT_PUBLIC_`.

---

## Routes

- `/trace` — lookup and recent demo batches
- `/trace/[recordHash]` — public Batch Passport
- `/verify` — upload/paste metadata and compare with Monad
- `/admin/batches/new` — authorized batch registration
- `/admin/batches/[recordHash]/attest` — authorized attestation entry

Do not build authentication infrastructure for the hackathon. Wallet role
checks are sufficient for the testnet prototype.

---

## Design direction

The product should look like a premium food provenance instrument, not a DeFi
dashboard.

### Visual concept

**Korean pantry label meets technical audit trail.**

- Warm paper or label surface for product details
- Deep ink chrome around verification tools
- Fermentation timeline as the main visual
- Monad purple used only for cryptographic verification and explorer actions
- Red reserved for quarantine, recall, or tamper failure
- Mono type for hashes, addresses, timestamps, and transaction IDs
- Serif or humanist face for product and batch narrative
- Clear QR code with a direct public Batch Passport URL

### Copy rules

- Say `Registered`, not `certified`.
- Say `Verified against the Monad record`, not `blockchain-approved`.
- Say `Authorized verifier`, not `independent auditor`.
- Never claim that a hash proves the underlying contents are true.

---

## Demo fixtures

Bundle one clearly fictional demo batch:

- Product: Madame Kimchi Original Napa Cabbage Kimchi
- Batch ID: `MK-DEMO-2026-001`
- Status: `ACTIVE`
- Fictional ingredient, fermentation, packing, shipping, and receipt events
- Every screen must label it `DEMO DATA — NOT A COMMERCIAL BATCH`

The full demo must work without API calls or external databases after the
contract data has been registered.

---

## Out of scope

- ERC-20, ERC-721, ERC-1155, or financial tokens
- XPR bridge or holder migration
- Tax, burn, staking, yield, liquidity, swap, or payments
- DAO Governor
- Food-bank disbursement system
- Merchant settlement
- AI meme engine
- Metaverse, games, or speculative NFTs
- Mainnet deployment
- Real food-safety certification
- Centralized custody
- Private document storage
- Mobile-first redesign

When a request expands into an out-of-scope item, explain the smaller
provenance implementation instead.

---

@AGENTS.md
