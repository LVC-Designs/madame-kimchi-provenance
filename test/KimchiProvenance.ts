import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { anyValue } from "@nomicfoundation/hardhat-viem-assertions/predicates";
import { network } from "hardhat";
import { keccak256, toBytes, zeroAddress } from "viem";

/**
 * Enum orderings mirror `KimchiProvenance.sol`. If either list is reordered,
 * these constants must move with it — that coupling is intentional and is the
 * same coupling `src/lib/schema.ts` carries.
 */
const BatchStatus = {
  ACTIVE: 0,
  QUARANTINED: 1,
  RECALLED: 2,
  SUPERSEDED: 3,
} as const;

const AttestationType = {
  INGREDIENT_RECEIVED: 0,
  FERMENTATION_STARTED: 1,
  FERMENTATION_COMPLETED: 2,
  QUALITY_CHECK: 3,
  PACKED: 4,
  SHIPPED: 5,
  DISTRIBUTOR_RECEIVED: 6,
  RETAILER_RECEIVED: 7,
  QUARANTINED: 8,
  RECALLED: 9,
  CORRECTION: 10,
} as const;

const ZERO_HASH = `0x${"0".repeat(64)}` as const;

/** Stand-in for a canonical-JSON hash. Only distinctness matters here. */
function h(label: string) {
  return keccak256(toBytes(label));
}

const BATCH_ID = h("MK-DEMO-2026-001");
const RECORD_V1 = h("record-v1");
const RECORD_V2 = h("record-v2");
const RECORD_V3 = h("record-v3");
const REASON = h("reason-document");
const URI = "https://madamekimchi.global/batches/MK-DEMO-2026-001.json";

describe("KimchiProvenance", async () => {
  const { viem } = await network.create();
  const [adminClient, verifierClient, outsiderClient] = await viem.getWalletClients();

  const admin = adminClient.account.address;
  const verifier = verifierClient.account.address;
  const outsider = outsiderClient.account.address;

  /** Fresh contract per test — no state bleeds between cases. */
  async function deploy() {
    return viem.deployContract("KimchiProvenance", [admin]);
  }

  /** Fresh contract with an ACTIVE v1 already registered by the admin. */
  async function deployWithBatch() {
    const contract = await deploy();
    await contract.write.registerBatch([
      RECORD_V1,
      BATCH_ID,
      ZERO_HASH,
      BatchStatus.ACTIVE,
      URI,
    ]);
    return contract;
  }

  // -------------------------------------------------------------------
  describe("deployment", () => {
    it("seats the admin in all three roles", async () => {
      const contract = await deploy();

      const [adminRole, verifierRole, pauserRole] = await Promise.all([
        contract.read.DEFAULT_ADMIN_ROLE(),
        contract.read.VERIFIER_ROLE(),
        contract.read.PAUSER_ROLE(),
      ]);

      assert.equal(await contract.read.hasRole([adminRole, admin]), true);
      assert.equal(await contract.read.hasRole([verifierRole, admin]), true);
      assert.equal(await contract.read.hasRole([pauserRole, admin]), true);
    });

    it("grants nothing to anyone else", async () => {
      const contract = await deploy();
      const verifierRole = await contract.read.VERIFIER_ROLE();

      assert.equal(await contract.read.hasRole([verifierRole, outsider]), false);
    });

    it("starts unpaused and declares the supported schema version", async () => {
      const contract = await deploy();

      assert.equal(await contract.read.paused(), false);
      assert.equal(await contract.read.SUPPORTED_SCHEMA_VERSION(), 1);
    });

    it("rejects a zero admin", async () => {
      // A reverting deployment yields no instance, so borrow a good one's ABI.
      const abiSource = await deploy();

      await viem.assertions.revertWithCustomError(
        viem.deployContract("KimchiProvenance", [zeroAddress]),
        abiSource,
        "ZeroAddress",
      );
    });
  });

  // -------------------------------------------------------------------
  describe("registerBatch", () => {
    it("registers a record and emits BatchRegistered", async () => {
      const contract = await deploy();

      await viem.assertions.emitWithArgs(
        contract.write.registerBatch([
          RECORD_V1,
          BATCH_ID,
          ZERO_HASH,
          BatchStatus.ACTIVE,
          URI,
        ]),
        contract,
        "BatchRegistered",
        [RECORD_V1, BATCH_ID, admin, ZERO_HASH, BatchStatus.ACTIVE, URI, anyValue],
      );
    });

    it("stores every field of the record", async () => {
      const contract = await deployWithBatch();
      const record = await contract.read.getBatch([RECORD_V1]);

      assert.equal(record.batchIdHash, BATCH_ID);
      assert.equal(record.supersedesRecordHash, ZERO_HASH);
      assert.equal(record.supersededByRecordHash, ZERO_HASH);
      assert.equal(record.issuer.toLowerCase(), admin.toLowerCase());
      assert.equal(record.status, BatchStatus.ACTIVE);
      assert.equal(record.metadataURI, URI);
      assert.ok(record.registeredAt > 0n);
    });

    it("reports existence", async () => {
      const contract = await deployWithBatch();

      assert.equal(await contract.read.exists([RECORD_V1]), true);
      assert.equal(await contract.read.exists([RECORD_V2]), false);
    });

    it("accepts an empty metadataURI for a hash-only registration", async () => {
      const contract = await deploy();
      await contract.write.registerBatch([
        RECORD_V1,
        BATCH_ID,
        ZERO_HASH,
        BatchStatus.ACTIVE,
        "",
      ]);

      const record = await contract.read.getBatch([RECORD_V1]);
      assert.equal(record.metadataURI, "");
    });

    it("accepts QUARANTINED as an initial status", async () => {
      const contract = await deploy();
      await contract.write.registerBatch([
        RECORD_V1,
        BATCH_ID,
        ZERO_HASH,
        BatchStatus.QUARANTINED,
        URI,
      ]);

      assert.equal(await contract.read.getBatchStatus([RECORD_V1]), BatchStatus.QUARANTINED);
    });

    it("refuses to register directly as RECALLED, so a recall always carries a reason", async () => {
      const contract = await deploy();

      await viem.assertions.revertWithCustomErrorWithArgs(
        contract.write.registerBatch([
          RECORD_V1,
          BATCH_ID,
          ZERO_HASH,
          BatchStatus.RECALLED,
          URI,
        ]),
        contract,
        "InvalidInitialStatus",
        [BatchStatus.RECALLED],
      );
    });

    it("rejects a zero record hash", async () => {
      const contract = await deploy();

      await viem.assertions.revertWithCustomError(
        contract.write.registerBatch([ZERO_HASH, BATCH_ID, ZERO_HASH, BatchStatus.ACTIVE, URI]),
        contract,
        "ZeroHash",
      );
    });

    it("rejects a zero batch id hash", async () => {
      const contract = await deploy();

      await viem.assertions.revertWithCustomError(
        contract.write.registerBatch([RECORD_V1, ZERO_HASH, ZERO_HASH, BatchStatus.ACTIVE, URI]),
        contract,
        "ZeroHash",
      );
    });

    it("rejects a URI over the length cap", async () => {
      const contract = await deploy();

      await viem.assertions.revertWithCustomErrorWithArgs(
        contract.write.registerBatch([
          RECORD_V1,
          BATCH_ID,
          ZERO_HASH,
          BatchStatus.ACTIVE,
          "x".repeat(2049),
        ]),
        contract,
        "URITooLong",
        [2049n, 2048n],
      );
    });
  });

  // -------------------------------------------------------------------
  describe("duplicate record rejection", () => {
    it("rejects the same record hash twice", async () => {
      const contract = await deployWithBatch();

      await viem.assertions.revertWithCustomErrorWithArgs(
        contract.write.registerBatch([
          RECORD_V1,
          BATCH_ID,
          ZERO_HASH,
          BatchStatus.ACTIVE,
          URI,
        ]),
        contract,
        "BatchAlreadyRegistered",
        [RECORD_V1],
      );
    });

    it("does not overwrite the original issuer or URI on a rejected duplicate", async () => {
      const contract = await deployWithBatch();
      const verifierRole = await contract.read.VERIFIER_ROLE();
      await contract.write.grantRole([verifierRole, verifier]);

      await viem.assertions.revertWithCustomError(
        contract.write.registerBatch(
          [RECORD_V1, BATCH_ID, ZERO_HASH, BatchStatus.ACTIVE, "https://evil.example/x.json"],
          { account: verifierClient.account },
        ),
        contract,
        "BatchAlreadyRegistered",
      );

      const record = await contract.read.getBatch([RECORD_V1]);
      assert.equal(record.issuer.toLowerCase(), admin.toLowerCase());
      assert.equal(record.metadataURI, URI);
    });
  });

  // -------------------------------------------------------------------
  describe("unauthorized access", () => {
    it("blocks registration without VERIFIER_ROLE", async () => {
      const contract = await deploy();

      await viem.assertions.revertWithCustomError(
        contract.write.registerBatch(
          [RECORD_V1, BATCH_ID, ZERO_HASH, BatchStatus.ACTIVE, URI],
          { account: outsiderClient.account },
        ),
        contract,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("blocks attestation without VERIFIER_ROLE", async () => {
      const contract = await deployWithBatch();

      await viem.assertions.revertWithCustomError(
        contract.write.addAttestation(
          [RECORD_V1, h("a1"), AttestationType.PACKED, ""],
          { account: outsiderClient.account },
        ),
        contract,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("blocks status changes without VERIFIER_ROLE", async () => {
      const contract = await deployWithBatch();

      await viem.assertions.revertWithCustomError(
        contract.write.updateBatchStatus(
          [RECORD_V1, BatchStatus.RECALLED, REASON, ""],
          { account: outsiderClient.account },
        ),
        contract,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("blocks pausing without PAUSER_ROLE", async () => {
      const contract = await deploy();

      await viem.assertions.revertWithCustomError(
        contract.write.pause({ account: outsiderClient.account }),
        contract,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("blocks role grants without DEFAULT_ADMIN_ROLE", async () => {
      const contract = await deploy();
      const verifierRole = await contract.read.VERIFIER_ROLE();

      await viem.assertions.revertWithCustomError(
        contract.write.grantRole([verifierRole, outsider], { account: outsiderClient.account }),
        contract,
        "AccessControlUnauthorizedAccount",
      );
    });
  });

  // -------------------------------------------------------------------
  describe("pause and unpause", () => {
    it("blocks all three state-changing entry points while paused", async () => {
      const contract = await deployWithBatch();
      await contract.write.pause();

      assert.equal(await contract.read.paused(), true);

      await viem.assertions.revertWithCustomError(
        contract.write.registerBatch([RECORD_V2, BATCH_ID, ZERO_HASH, BatchStatus.ACTIVE, URI]),
        contract,
        "EnforcedPause",
      );
      await viem.assertions.revertWithCustomError(
        contract.write.addAttestation([RECORD_V1, h("a1"), AttestationType.PACKED, ""]),
        contract,
        "EnforcedPause",
      );
      await viem.assertions.revertWithCustomError(
        contract.write.updateBatchStatus([RECORD_V1, BatchStatus.RECALLED, REASON, ""]),
        contract,
        "EnforcedPause",
      );
    });

    it("keeps reads available while paused", async () => {
      const contract = await deployWithBatch();
      await contract.write.pause();

      assert.equal(await contract.read.exists([RECORD_V1]), true);
      const record = await contract.read.getBatch([RECORD_V1]);
      assert.equal(record.status, BatchStatus.ACTIVE);
    });

    it("restores writes after unpause", async () => {
      const contract = await deployWithBatch();
      await contract.write.pause();
      await contract.write.unpause();

      assert.equal(await contract.read.paused(), false);

      await contract.write.addAttestation([RECORD_V1, h("a1"), AttestationType.PACKED, ""]);
      assert.equal(await contract.read.attestationExists([h("a1")]), true);
    });
  });

  // -------------------------------------------------------------------
  describe("updateBatchStatus", () => {
    it("moves ACTIVE to QUARANTINED and emits the change", async () => {
      const contract = await deployWithBatch();

      await viem.assertions.emitWithArgs(
        contract.write.updateBatchStatus([RECORD_V1, BatchStatus.QUARANTINED, REASON, URI]),
        contract,
        "BatchStatusChanged",
        [RECORD_V1, BatchStatus.ACTIVE, BatchStatus.QUARANTINED, admin, REASON, URI, anyValue],
      );

      assert.equal(await contract.read.getBatchStatus([RECORD_V1]), BatchStatus.QUARANTINED);
    });

    it("releases a quarantine back to ACTIVE", async () => {
      const contract = await deployWithBatch();
      await contract.write.updateBatchStatus([RECORD_V1, BatchStatus.QUARANTINED, REASON, ""]);
      await contract.write.updateBatchStatus([RECORD_V1, BatchStatus.ACTIVE, h("cleared"), ""]);

      assert.equal(await contract.read.getBatchStatus([RECORD_V1]), BatchStatus.ACTIVE);
    });

    it("recalls from ACTIVE and from QUARANTINED", async () => {
      const fromActive = await deployWithBatch();
      await fromActive.write.updateBatchStatus([RECORD_V1, BatchStatus.RECALLED, REASON, ""]);
      assert.equal(await fromActive.read.getBatchStatus([RECORD_V1]), BatchStatus.RECALLED);

      const fromQuarantine = await deployWithBatch();
      await fromQuarantine.write.updateBatchStatus([
        RECORD_V1,
        BatchStatus.QUARANTINED,
        REASON,
        "",
      ]);
      await fromQuarantine.write.updateBatchStatus([RECORD_V1, BatchStatus.RECALLED, REASON, ""]);
      assert.equal(await fromQuarantine.read.getBatchStatus([RECORD_V1]), BatchStatus.RECALLED);
    });

    it("treats RECALLED as terminal and irreversible", async () => {
      const contract = await deployWithBatch();
      await contract.write.updateBatchStatus([RECORD_V1, BatchStatus.RECALLED, REASON, ""]);

      await viem.assertions.revertWithCustomErrorWithArgs(
        contract.write.updateBatchStatus([RECORD_V1, BatchStatus.ACTIVE, REASON, ""]),
        contract,
        "InvalidStatusTransition",
        [BatchStatus.RECALLED, BatchStatus.ACTIVE],
      );
    });

    it("refuses to set SUPERSEDED directly", async () => {
      const contract = await deployWithBatch();

      await viem.assertions.revertWithCustomErrorWithArgs(
        contract.write.updateBatchStatus([RECORD_V1, BatchStatus.SUPERSEDED, REASON, ""]),
        contract,
        "InvalidStatusTransition",
        [BatchStatus.ACTIVE, BatchStatus.SUPERSEDED],
      );
    });

    it("rejects a no-op transition", async () => {
      const contract = await deployWithBatch();

      await viem.assertions.revertWithCustomErrorWithArgs(
        contract.write.updateBatchStatus([RECORD_V1, BatchStatus.ACTIVE, REASON, ""]),
        contract,
        "StatusUnchanged",
        [BatchStatus.ACTIVE],
      );
    });

    it("requires a reason hash", async () => {
      const contract = await deployWithBatch();

      await viem.assertions.revertWithCustomError(
        contract.write.updateBatchStatus([RECORD_V1, BatchStatus.RECALLED, ZERO_HASH, ""]),
        contract,
        "MissingReason",
      );
    });

    it("rejects an unknown record", async () => {
      const contract = await deployWithBatch();

      await viem.assertions.revertWithCustomErrorWithArgs(
        contract.write.updateBatchStatus([RECORD_V2, BatchStatus.RECALLED, REASON, ""]),
        contract,
        "BatchNotFound",
        [RECORD_V2],
      );
    });
  });

  // -------------------------------------------------------------------
  describe("addAttestation", () => {
    it("appends an attestation and emits it", async () => {
      const contract = await deployWithBatch();
      const attestation = h("fermentation-started");

      await viem.assertions.emitWithArgs(
        contract.write.addAttestation([
          RECORD_V1,
          attestation,
          AttestationType.FERMENTATION_STARTED,
          URI,
        ]),
        contract,
        "AttestationAdded",
        [
          RECORD_V1,
          attestation,
          AttestationType.FERMENTATION_STARTED,
          admin,
          URI,
          anyValue,
        ],
      );
    });

    it("records the batch link and increments the count", async () => {
      const contract = await deployWithBatch();
      await contract.write.addAttestation([RECORD_V1, h("a1"), AttestationType.PACKED, ""]);
      await contract.write.addAttestation([RECORD_V1, h("a2"), AttestationType.SHIPPED, ""]);

      assert.equal(await contract.read.attestationExists([h("a1")]), true);
      assert.equal(await contract.read.attestationBatchOf([h("a2")]), RECORD_V1);
      assert.equal(await contract.read.attestationCount([RECORD_V1]), 2);
    });

    it("still accepts attestations on a recalled batch", async () => {
      const contract = await deployWithBatch();
      await contract.write.updateBatchStatus([RECORD_V1, BatchStatus.RECALLED, REASON, ""]);

      await contract.write.addAttestation([
        RECORD_V1,
        h("returned-stock"),
        AttestationType.CORRECTION,
        "",
      ]);

      assert.equal(await contract.read.attestationCount([RECORD_V1]), 1);
    });

    it("rejects a zero attestation hash", async () => {
      const contract = await deployWithBatch();

      await viem.assertions.revertWithCustomError(
        contract.write.addAttestation([RECORD_V1, ZERO_HASH, AttestationType.PACKED, ""]),
        contract,
        "ZeroHash",
      );
    });
  });

  // -------------------------------------------------------------------
  describe("duplicate attestation rejection", () => {
    it("rejects the same attestation hash twice on one batch", async () => {
      const contract = await deployWithBatch();
      await contract.write.addAttestation([RECORD_V1, h("a1"), AttestationType.PACKED, ""]);

      await viem.assertions.revertWithCustomErrorWithArgs(
        contract.write.addAttestation([RECORD_V1, h("a1"), AttestationType.SHIPPED, ""]),
        contract,
        "AttestationAlreadyRecorded",
        [h("a1")],
      );
    });

    it("rejects the same attestation hash across different batches", async () => {
      const contract = await deployWithBatch();
      await contract.write.registerBatch([
        RECORD_V3,
        h("MK-DEMO-2026-002"),
        ZERO_HASH,
        BatchStatus.ACTIVE,
        "",
      ]);
      await contract.write.addAttestation([RECORD_V1, h("a1"), AttestationType.PACKED, ""]);

      await viem.assertions.revertWithCustomError(
        contract.write.addAttestation([RECORD_V3, h("a1"), AttestationType.PACKED, ""]),
        contract,
        "AttestationAlreadyRecorded",
      );
    });

    it("leaves the count untouched after a rejected duplicate", async () => {
      const contract = await deployWithBatch();
      await contract.write.addAttestation([RECORD_V1, h("a1"), AttestationType.PACKED, ""]);
      await viem.assertions.revertWithCustomError(
        contract.write.addAttestation([RECORD_V1, h("a1"), AttestationType.PACKED, ""]),
        contract,
        "AttestationAlreadyRecorded",
      );

      assert.equal(await contract.read.attestationCount([RECORD_V1]), 1);
    });
  });

  // -------------------------------------------------------------------
  describe("unknown batch", () => {
    it("getBatch reverts instead of returning an empty record", async () => {
      const contract = await deploy();

      await viem.assertions.revertWithCustomErrorWithArgs(
        contract.read.getBatch([RECORD_V1]),
        contract,
        "BatchNotFound",
        [RECORD_V1],
      );
    });

    it("getBatchStatus reverts", async () => {
      const contract = await deploy();

      await viem.assertions.revertWithCustomError(
        contract.read.getBatchStatus([RECORD_V1]),
        contract,
        "BatchNotFound",
      );
    });

    it("getLatestRecord reverts on an unknown batch id", async () => {
      const contract = await deploy();

      await viem.assertions.revertWithCustomErrorWithArgs(
        contract.read.getLatestRecord([BATCH_ID]),
        contract,
        "UnknownBatchId",
        [BATCH_ID],
      );
    });

    it("rejects an attestation against an unregistered record", async () => {
      const contract = await deploy();

      await viem.assertions.revertWithCustomErrorWithArgs(
        contract.write.addAttestation([RECORD_V1, h("a1"), AttestationType.PACKED, ""]),
        contract,
        "BatchNotFound",
        [RECORD_V1],
      );
    });

    it("reports zero counts for unknown hashes without reverting", async () => {
      const contract = await deploy();

      assert.equal(await contract.read.attestationCount([RECORD_V1]), 0);
      assert.equal(await contract.read.versionCount([BATCH_ID]), 0n);
      assert.equal(await contract.read.attestationBatchOf([h("a1")]), ZERO_HASH);
    });
  });

  // -------------------------------------------------------------------
  describe("superseding", () => {
    /** v1 ACTIVE, then v2 supersedes it. */
    async function deploySuperseded() {
      const contract = await deployWithBatch();
      await contract.write.registerBatch([
        RECORD_V2,
        BATCH_ID,
        RECORD_V1,
        BatchStatus.ACTIVE,
        URI,
      ]);
      return contract;
    }

    it("emits BatchSuperseded linking old to new", async () => {
      const contract = await deployWithBatch();

      await viem.assertions.emitWithArgs(
        contract.write.registerBatch([RECORD_V2, BATCH_ID, RECORD_V1, BatchStatus.ACTIVE, URI]),
        contract,
        "BatchSuperseded",
        [RECORD_V1, RECORD_V2, BATCH_ID, anyValue],
      );
    });

    it("also emits BatchStatusChanged so every transition has one event type", async () => {
      const contract = await deployWithBatch();

      await viem.assertions.emitWithArgs(
        contract.write.registerBatch([RECORD_V2, BATCH_ID, RECORD_V1, BatchStatus.ACTIVE, URI]),
        contract,
        "BatchStatusChanged",
        [
          RECORD_V1,
          BatchStatus.ACTIVE,
          BatchStatus.SUPERSEDED,
          admin,
          ZERO_HASH,
          "",
          anyValue,
        ],
      );
    });

    it("keeps the superseded record fully readable", async () => {
      const contract = await deploySuperseded();
      const v1 = await contract.read.getBatch([RECORD_V1]);

      assert.equal(await contract.read.exists([RECORD_V1]), true);
      assert.equal(v1.batchIdHash, BATCH_ID);
      assert.equal(v1.metadataURI, URI);
      assert.equal(v1.issuer.toLowerCase(), admin.toLowerCase());
      assert.ok(v1.registeredAt > 0n);
    });

    it("links both directions", async () => {
      const contract = await deploySuperseded();
      const [v1, v2] = await Promise.all([
        contract.read.getBatch([RECORD_V1]),
        contract.read.getBatch([RECORD_V2]),
      ]);

      assert.equal(v1.supersededByRecordHash, RECORD_V2);
      assert.equal(v1.supersedesRecordHash, ZERO_HASH);
      assert.equal(v2.supersedesRecordHash, RECORD_V1);
      assert.equal(v2.supersededByRecordHash, ZERO_HASH);
    });

    it("marks the old record SUPERSEDED and leaves the new one current", async () => {
      const contract = await deploySuperseded();

      assert.equal(await contract.read.getBatchStatus([RECORD_V1]), BatchStatus.SUPERSEDED);
      assert.equal(await contract.read.getBatchStatus([RECORD_V2]), BatchStatus.ACTIVE);
    });

    it("supports a three-version chain", async () => {
      const contract = await deploySuperseded();
      await contract.write.registerBatch([
        RECORD_V3,
        BATCH_ID,
        RECORD_V2,
        BatchStatus.ACTIVE,
        URI,
      ]);

      assert.equal(await contract.read.versionCount([BATCH_ID]), 3n);
      assert.equal(await contract.read.getLatestRecord([BATCH_ID]), RECORD_V3);
      assert.equal(await contract.read.getBatchStatus([RECORD_V2]), BatchStatus.SUPERSEDED);
    });

    it("carries a quarantine forward instead of letting a correction clear it", async () => {
      const contract = await deploy();
      await contract.write.registerBatch([
        RECORD_V1,
        BATCH_ID,
        ZERO_HASH,
        BatchStatus.QUARANTINED,
        URI,
      ]);

      await viem.assertions.revertWithCustomErrorWithArgs(
        contract.write.registerBatch([RECORD_V2, BATCH_ID, RECORD_V1, BatchStatus.ACTIVE, URI]),
        contract,
        "PredecessorStatusMismatch",
        [BatchStatus.QUARANTINED, BatchStatus.ACTIVE],
      );

      await contract.write.registerBatch([
        RECORD_V2,
        BATCH_ID,
        RECORD_V1,
        BatchStatus.QUARANTINED,
        URI,
      ]);
      assert.equal(await contract.read.getBatchStatus([RECORD_V2]), BatchStatus.QUARANTINED);
    });

    it("refuses to supersede a recalled record", async () => {
      const contract = await deployWithBatch();
      await contract.write.updateBatchStatus([RECORD_V1, BatchStatus.RECALLED, REASON, ""]);

      await viem.assertions.revertWithCustomErrorWithArgs(
        contract.write.registerBatch([RECORD_V2, BATCH_ID, RECORD_V1, BatchStatus.ACTIVE, URI]),
        contract,
        "CannotSupersedeTerminalRecord",
        [RECORD_V1, BatchStatus.RECALLED],
      );
    });

    it("refuses to fork a version chain", async () => {
      const contract = await deploySuperseded();

      await viem.assertions.revertWithCustomErrorWithArgs(
        contract.write.registerBatch([RECORD_V3, BATCH_ID, RECORD_V1, BatchStatus.ACTIVE, URI]),
        contract,
        "PredecessorAlreadySuperseded",
        [RECORD_V1, RECORD_V2],
      );
    });

    it("refuses to supersede a record from a different batch", async () => {
      const contract = await deployWithBatch();
      const otherBatch = h("MK-DEMO-2026-002");

      await viem.assertions.revertWithCustomErrorWithArgs(
        contract.write.registerBatch([RECORD_V2, otherBatch, RECORD_V1, BatchStatus.ACTIVE, URI]),
        contract,
        "PredecessorBatchIdMismatch",
        [BATCH_ID, otherBatch],
      );
    });

    it("refuses self-supersession", async () => {
      const contract = await deploy();

      await viem.assertions.revertWithCustomError(
        contract.write.registerBatch([RECORD_V1, BATCH_ID, RECORD_V1, BatchStatus.ACTIVE, URI]),
        contract,
        "SelfSupersede",
      );
    });

    it("refuses to supersede a record that was never registered", async () => {
      const contract = await deploy();

      await viem.assertions.revertWithCustomErrorWithArgs(
        contract.write.registerBatch([RECORD_V2, BATCH_ID, RECORD_V1, BatchStatus.ACTIVE, URI]),
        contract,
        "PredecessorNotFound",
        [RECORD_V1],
      );
    });

    it("keeps attestations on the superseded record readable", async () => {
      const contract = await deployWithBatch();
      await contract.write.addAttestation([RECORD_V1, h("a1"), AttestationType.PACKED, ""]);
      await contract.write.registerBatch([
        RECORD_V2,
        BATCH_ID,
        RECORD_V1,
        BatchStatus.ACTIVE,
        URI,
      ]);

      assert.equal(await contract.read.attestationCount([RECORD_V1]), 1);
      assert.equal(await contract.read.attestationBatchOf([h("a1")]), RECORD_V1);
    });
  });

  // -------------------------------------------------------------------
  describe("retrieval", () => {
    it("lists versions oldest first", async () => {
      const contract = await deployWithBatch();
      await contract.write.registerBatch([
        RECORD_V2,
        BATCH_ID,
        RECORD_V1,
        BatchStatus.ACTIVE,
        URI,
      ]);

      const versions = await contract.read.getVersions([BATCH_ID]);
      assert.deepEqual([...versions], [RECORD_V1, RECORD_V2]);
    });

    it("returns an empty version list for an unknown batch id", async () => {
      const contract = await deploy();

      assert.deepEqual([...(await contract.read.getVersions([BATCH_ID]))], []);
    });

    it("keeps separate batches independent", async () => {
      const contract = await deployWithBatch();
      const otherBatch = h("MK-DEMO-2026-002");
      await contract.write.registerBatch([
        RECORD_V3,
        otherBatch,
        ZERO_HASH,
        BatchStatus.ACTIVE,
        "",
      ]);

      assert.equal(await contract.read.versionCount([BATCH_ID]), 1n);
      assert.equal(await contract.read.versionCount([otherBatch]), 1n);
      assert.equal(await contract.read.getLatestRecord([otherBatch]), RECORD_V3);
    });
  });

  // -------------------------------------------------------------------
  describe("role transfer", () => {
    it("lets a granted verifier register", async () => {
      const contract = await deploy();
      const verifierRole = await contract.read.VERIFIER_ROLE();
      await contract.write.grantRole([verifierRole, verifier]);

      await contract.write.registerBatch(
        [RECORD_V1, BATCH_ID, ZERO_HASH, BatchStatus.ACTIVE, URI],
        { account: verifierClient.account },
      );

      const record = await contract.read.getBatch([RECORD_V1]);
      assert.equal(record.issuer.toLowerCase(), verifier.toLowerCase());
    });

    it("stops a revoked verifier", async () => {
      const contract = await deploy();
      const verifierRole = await contract.read.VERIFIER_ROLE();
      await contract.write.grantRole([verifierRole, verifier]);
      await contract.write.revokeRole([verifierRole, verifier]);

      await viem.assertions.revertWithCustomError(
        contract.write.registerBatch(
          [RECORD_V1, BATCH_ID, ZERO_HASH, BatchStatus.ACTIVE, URI],
          { account: verifierClient.account },
        ),
        contract,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("leaves records registered by a revoked verifier intact", async () => {
      const contract = await deploy();
      const verifierRole = await contract.read.VERIFIER_ROLE();
      await contract.write.grantRole([verifierRole, verifier]);
      await contract.write.registerBatch(
        [RECORD_V1, BATCH_ID, ZERO_HASH, BatchStatus.ACTIVE, URI],
        { account: verifierClient.account },
      );
      await contract.write.revokeRole([verifierRole, verifier]);

      const record = await contract.read.getBatch([RECORD_V1]);
      assert.equal(record.issuer.toLowerCase(), verifier.toLowerCase());
      assert.equal(record.status, BatchStatus.ACTIVE);
    });

    it("hands administration to a new admin who can then seat verifiers", async () => {
      const contract = await deploy();
      const adminRole = await contract.read.DEFAULT_ADMIN_ROLE();
      const verifierRole = await contract.read.VERIFIER_ROLE();

      // Grant first, renounce second — the multisig handoff path.
      await contract.write.grantRole([adminRole, verifier]);
      await contract.write.renounceRole([adminRole, admin]);

      assert.equal(await contract.read.hasRole([adminRole, admin]), false);
      assert.equal(await contract.read.hasRole([adminRole, verifier]), true);

      await contract.write.grantRole([verifierRole, outsider], {
        account: verifierClient.account,
      });
      assert.equal(await contract.read.hasRole([verifierRole, outsider]), true);

      await viem.assertions.revertWithCustomError(
        contract.write.grantRole([verifierRole, admin]),
        contract,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("separates the pauser role from the verifier role", async () => {
      const contract = await deploy();
      const pauserRole = await contract.read.PAUSER_ROLE();
      const verifierRole = await contract.read.VERIFIER_ROLE();

      await contract.write.grantRole([verifierRole, verifier]);

      assert.equal(await contract.read.hasRole([pauserRole, verifier]), false);
      await viem.assertions.revertWithCustomError(
        contract.write.pause({ account: verifierClient.account }),
        contract,
        "AccessControlUnauthorizedAccount",
      );
    });
  });
});
