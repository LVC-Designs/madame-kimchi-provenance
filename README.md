# Madame Kimchi — Batch Provenance Protocol

> **This is an unaudited Monad Testnet prototype using fictional demonstration
> data. It is not a food-safety certification system, token offering,
> charitable fundraising mechanism, or production traceability service.**

A public, tamper-evident record connecting a physical kimchi batch to the
claims, documents, and authorized attestations published about it.

---

## 1. The problem

A jar of kimchi carries claims: where the cabbage came from, when fermentation
started, which lot it belongs to, who handled it and when. Today those claims
live in a producer's private database. Anyone who wants to check them — a
distributor, a retailer, a regulator, a customer holding the jar — has to ask
the producer and take the answer on trust.

That has two failure modes, and neither is detectable from outside. A record can
be changed after the fact with nobody able to tell. And a recall or correction
is only as visible as the producer chooses to make it.

## 2. The solution

Public batch metadata is serialized to one exact byte sequence, hashed with
`keccak256`, and that hash is registered on Monad Testnet by a wallet holding a
verifier role. Chain-of-custody events are appended the same way. Nothing is
ever edited or deleted — a correction publishes a new version that supersedes
the old one, and the original stays readable forever.

A QR code on the jar opens a public Batch Passport. Anyone can download the
published document, re-hash it in their own browser, and compare. One changed
character produces a different hash.

## 3. What Monad proves

> An authorized verifier registered this exact batch record or attestation at
> this time; the published record has not changed; and anyone can independently
> check the record without trusting Madame Kimchi's private database.

Concretely:

- **Registration and time.** A wallet holding `VERIFIER_ROLE` submitted this
  hash, in this block, at this timestamp.
- **Integrity.** The published document still hashes to the registered value.
  Any edit to any field changes the hash.
- **Append-only history.** Attestations, status changes, and supersessions are
  permanent events. A recall cannot be quietly withdrawn.
- **Independence.** Verification runs client-side over public data. It does not
  require this website to be online, honest, or even to exist.

## 4. What Monad does **not** prove

- **Not that the contents are true.** A hash fixes what was published, not
  whether it is accurate. A verifier can publish a wrong date, and the record
  will faithfully preserve that they did.
- **Not food safety.** Nothing here inspects, tests, or approves any product.
- **Not certification validity.** `certificationReferences` are references. The
  system does not check that a certification is real, current, or applicable.
- **Not physical linkage.** Nothing establishes that the jar in your hand is the
  batch this record describes. The QR code is a pointer, not a proof.
- **Not verifier honesty.** Any `VERIFIER_ROLE` holder can register anything.
  Records are exactly as trustworthy as the parties holding that role.
- **Not document availability.** `metadataURI` may be offline or may serve
  something else entirely. The contract cannot know; the client re-hashes
  whatever it receives and reports what it finds.

## 5. Architecture

```
 BROWSER  (no wallet required to read)
 ┌────────────────────────────────────────────────────────────┐
 │  /trace                lookup by record hash or batch ID   │
 │  /trace/[recordHash]   public Batch Passport + QR          │
 │  /verify               upload · paste · hash · compare     │
 │  /admin/…/new          register a batch    (VERIFIER_ROLE) │
 │  /admin/…/attest       append attestation  (VERIFIER_ROLE) │
 └───────────┬─────────────────────────────────┬──────────────┘
             │                                 │
     lib/canonical.ts                  lib/verification.ts
     sort keys · NFC · LF ·            validate → canonicalize
     no whitespace · keccak256         → hash → compare → diff
             │                                 │
             └────────────────┬────────────────┘
                              │  public reads + signed writes (viem / wagmi)
                              ▼
 MONAD TESTNET  ·  chain 10143
 ┌────────────────────────────────────────────────────────────┐
 │  KimchiProvenance.sol      AccessControl + Pausable        │
 │                                                            │
 │  storage   recordHash     → BatchRecord                    │
 │            batchIdHash    → recordHash[]  (version chain)  │
 │            attestationHash→ recordHash    (duplicate guard)│
 │                                                            │
 │  events    BatchRegistered · AttestationAdded              │
 │            BatchStatusChanged · BatchSuperseded            │
 │            ↳ the append-only timeline lives here           │
 └────────────────────────────────────────────────────────────┘

 OFF-CHAIN, NEVER ON-CHAIN
   supplier documents · certificates · invoices · test reports
   personal data · pricing · private supplier terms · credentials
```

**The identity rule.** The canonical hash of a published document *is* its
identifier. `recordHash` is `keccak256` over the canonical `BatchMetadata` JSON;
`attestationHash` is the same over `AttestationMetadata`. There is no separate
"metadata hash" that could drift from the key — which is why verifying a
downloaded file is a single lookup with no derivation step for anyone to
reproduce or get wrong.

**Canonicalization rules** (`src/lib/canonical.ts`, the only place record data is
hashed): CRLF and lone CR → LF; Unicode NFC on keys and values; object keys
sorted by UTF-16 code unit, recursively; array order preserved because order is
semantic; no insignificant whitespace; a numeric `schemaVersion` required.

## 6. Contract address

| | |
|---|---|
| Network | Monad Testnet (chain `10143`) |
| Contract | `0xCBC03079CcdA3ef1E8700D0c0D66384c9918524F` |
| Deployment tx | `0xbaf61bf9370659869f08d8f88d395f47bbf6f657821cc85dd6b6c9fbaf37672e` |
| Deployment block | `48037641` |
| Admin / verifier / pauser | `0xda6E4b383EaF8290748392C21c46fa036A3064bE` |
| Compiler | Solidity `0.8.28`, `evmVersion: prague` |
| Demo batch record hash | `0x530be5d0882872eb58d27cab161bddeecf5448f751de0a23e4e6e003a6ec779a` |

## 7. Explorer links

- **Contract** — <https://testnet.monadscan.com/address/0xCBC03079CcdA3ef1E8700D0c0D66384c9918524F>
- **Deployment transaction** — <https://testnet.monadscan.com/tx/0xbaf61bf9370659869f08d8f88d395f47bbf6f657821cc85dd6b6c9fbaf37672e>
- **Deployer wallet** — <https://testnet.monadscan.com/address/0xda6E4b383EaF8290748392C21c46fa036A3064bE>

## 8. Setup

Requires **Node 22.18+** — the test suite relies on native TypeScript stripping.

```bash
npm install
cp .env.example .env               # Hardhat: RPC + deploy key
cp .env.local.example .env.local   # browser: RPC + contract address
npm run dev                        # http://localhost:3000
```

The app works read-only against the deployment above with **no configuration** —
the committed deployment record supplies the address. A public Batch Passport
reached by scanning a QR code must not depend on the reader having set an
environment variable.

To deploy your own registry:

```bash
npx hardhat keystore set PRIVATE_KEY   # encrypted; preferred over .env
npm run chain:deploy
npm run chain:abi                      # ABI     → src/lib/abi/
npm run chain:export                   # address → src/lib/deployment.ts
npm run demo:seed                      # register the fictional demo batch
```

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, app **and** Hardhat projects |
| `npm run test:lib` | Canonicalization, schema, verification — 90 tests |
| `npm run chain:test` | Contract tests — 64 tests |
| `npm run chain:compile` | Solidity build |
| `npm run chain:deploy` | Deploy to Monad Testnet |
| `npm run demo:seed` | Seed the fictional demo batch (idempotent) |

## 9. Environment variables

**`.env`** — Hardhat only. Never prefixed `NEXT_PUBLIC_`. Git-ignored.

| Variable | Purpose |
|---|---|
| `MONAD_TESTNET_RPC_URL` | RPC endpoint for deploying and seeding |
| `PRIVATE_KEY` | Deployer key. Prefer the encrypted Hardhat keystore. **Use a disposable testnet-only key.** |

**`.env.local`** — browser. Every value is inlined into the client bundle and is
public by design. Never put a key here.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_MONAD_RPC_URL` | Read-only RPC for the browser |
| `NEXT_PUBLIC_PROVENANCE_CONTRACT` | Registry address; overrides the committed record |
| `NEXT_PUBLIC_PROVENANCE_DEPLOY_BLOCK` | Floor for log scans |
| `NEXT_PUBLIC_SITE_URL` | Absolute origin used to build QR targets |

Hardhat resolves secrets through `configVariable` — lazily, and only when a
network connection opens — so `build` and `test` never touch the key and no
config dump can print it.

## 10. Security assumptions

1. **Role holders are trusted.** Any `VERIFIER_ROLE` wallet can register any
   hash. The registry authenticates *who published*, never *what is true*.
2. **Admin can reassign roles**, including its own. On testnet the deployer
   holds all three. Production must move `DEFAULT_ADMIN_ROLE` to a multisig —
   the constructor takes `admin` as a parameter so this needs no code change.
3. **Pausing blocks everything, including recalls.** The realistic reason to
   pause is a compromised key, and an attacker spamming fabricated recalls is
   precisely the damage being stopped. A genuine recall during a pause requires
   an explicit, logged unpause.
4. **Terminal states are terminal.** `RECALLED` cannot be withdrawn or
   superseded; a correction is appended and leaves the recall visible.
5. **No external calls.** The contract makes none, has no `payable` function, no
   `receive`, no `fallback`, and no `delegatecall` — so there is no reentrancy
   or arbitrary-call surface, and MON sent to it reverts.
6. **Not upgradeable, by requirement.** A defect means a fresh deployment;
   records at the old address stay readable forever.
7. **URIs are treated as hostile.** `metadataURI` is arbitrary contract data the
   schema never sees; document URIs are schema-validated. Both are allow-listed
   to `http`/`https` before becoming a link, because an append-only registry
   cannot retract a record containing a `javascript:` URI.
8. **Block timestamps are validator-influenced** within a small window. They are
   ordering evidence, not a precise clock.
9. **The browser is the verifier.** Hashing is client-side, so a compromised
   copy of this site could lie. That is exactly why the canonical rules are
   documented and the check is reproducible without it.

## 11. Limitations

- **Testnet only.** Monad Testnet offers no finality or persistence guarantees
  and may be reset. No record here carries commercial or regulatory standing.
- **Unaudited.** 64 contract tests, no external review.
- **RPC constraints shape the timeline.** The public endpoint caps `eth_getLogs`
  at a **100-block range** *and* **25 requests/second**. Timelines are rebuilt by
  paced, windowed scanning; when a scan cannot reach the chain head the
  interface says the timeline may be incomplete rather than presenting a
  truncated history as the whole story. Pointing `NEXT_PUBLIC_MONAD_RPC_URL` at
  an endpoint without a range cap removes this.
- **Attestations are not enumerable on-chain.** The timeline lives in events;
  storage holds only a duplicate guard and a count. Reconstruction depends on an
  RPC serving historical logs.
- **The demo `metadataURI` points at `localhost`.** This does *not* break the
  demo batch: `resolveMetadata` checks the bundled document first and only
  falls back to fetching, so a remote visitor still sees HASH_VERIFIED with no
  network call. The stale URI is cosmetic — it shows in the "Metadata URI" field
  and is not clickable. Any batch registered with a `localhost` URI that is
  *not* bundled would show METADATA UNAVAILABLE.
- **Version chains cannot fork**, and `getVersions` is unbounded — bounded in
  practice only by verifier trust.
- **No lookup by product name or date.** Only by record hash, batch ID, or the
  recent-registrations list.
- **Desktop-first.** Mobile refinement is explicitly out of scope.

## 12. Production validation gates

**None of the following are satisfied.** Each must be closed before this leaves
testnet, and several are commercial or legal rather than technical.

**Legal and regulatory**
- [ ] Counsel review of every published claim, in each target market
- [ ] Confirmation that no statement constitutes a food-safety or certification
      claim under applicable law
- [ ] Data-protection review of what reaches a permanent public ledger

**Commercial**
- [ ] Written agreements with any named supplier, distributor, retailer, or
      technology partner — no party may be named without one
- [ ] Documented methodology and evidence for any impact or contribution metric
- [ ] Agreed treatment of a record that must be corrected after a recall

**Technical**
- [ ] Independent smart-contract audit
- [ ] `DEFAULT_ADMIN_ROLE` transferred to a multisig; key custody documented
- [ ] Verifier onboarding, rotation, and revocation procedure
- [ ] Durable, addressable hosting for published metadata
- [ ] Log indexing that does not depend on a rate-limited public RPC
- [ ] Mainnet deployment plan with a rollback position

**Operational**
- [ ] Recall runbook, including who may pause and who may unpause
- [ ] Retention policy for off-chain documents referenced by hash
- [ ] Incident procedure for a compromised verifier key

## 13. Three-minute demo script

Understandable without explaining Web3. Times are cumulative.

**0:00 — The claim.** Open `/`. Read the sentence in the hero. Then say what it
does *not* say: nothing about food safety, nothing about whether the contents
are true. Point at the three boundaries in the footer of every page.

**0:30 — Register.** Open `/admin/batches/new`. The demo fixture is already
loaded. Change nothing. Show the **canonical JSON** panel — these are the exact
bytes about to be measured — and the **record hash** derived from them. Note the
"already registered" warning: records are never overwritten.

**1:00 — The passport.** Open
`/trace/0x530be5d0882872eb58d27cab161bddeecf5448f751de0a23e4e6e003a6ec779a`.
Warm paper for the product, deep ink for the verification tools. Scroll the
fermentation and chain-of-custody timeline — eight appended events, each with a
block number and a transaction link.

**1:30 — Scan it.** Show the QR panel and scan it with a phone. The same
passport opens. No wallet, no account, no login.

**2:00 — Download and tamper.** On `/verify`, click **Load demo document** →
`VERIFIED`. Now change one character — `lotNumber` from `L-2026-014` to
`L-2026-999` — and watch it turn `MODIFIED`, with a field-level diff naming
`lotNumber` and showing both values. Say plainly: this shows the file differs
from the registered version. It does not say who changed it, or that anyone did
anything wrong.

**2:30 — Reformat, then restore.** Re-indent the JSON, reorder its keys, save it
with Windows line endings — still `VERIFIED`. The hash is over meaning, not
formatting. Then restore the original character: `VERIFIED` again.

**2:50 — Land it.** The chain proved exactly one thing: an authorized verifier
published these exact bytes at this time, and they have not changed since.
Everything else remains a matter of trust — and the interface says so on every
screen.

---

## Validation status

Last full run:

| Check | Result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` (app + Hardhat) | clean |
| `npx hardhat build` (from clean) | `solc 0.8.28`, evm target `prague` |
| `npx hardhat test` | **64 passing** |
| `npm run test:lib` | **90 passing**, 22 suites |
| `npm run build` | 7 routes |
| All routes served | `200` |
| Live chain | chain `10143`, not paused, schema v1, demo batch present, 8 attestations, deployer holds `VERIFIER_ROLE` |
| Tamper demo, against live chain | untouched → `VERIFIED` · one field changed → `MODIFIED` (1 field: `lotNumber`) · restored → `VERIFIED` |

**Not executed:** the manual MetaMask chain-switch test, and the signing half of
the registration demo. Both need a browser with a wallet extension. The read
paths, gating logic, and error classification are covered by tests and live
chain reads, but the wallet interaction itself has not been exercised.
