import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { keccak256, toBytes } from "viem";

/**
 * The sandbox opens *authorization* and nothing else.
 *
 * These tests are deliberately split in two: the first group proves anyone can
 * write, the second proves that opening the gate did not also open anything
 * that would let a stranger damage the registry, and the third proves every
 * integrity guarantee the production contract makes still holds here. A
 * sandbox that quietly dropped duplicate rejection would teach the wrong
 * lesson about what the real thing does.
 */

const BatchStatus = { ACTIVE: 0, QUARANTINED: 1, RECALLED: 2, SUPERSEDED: 3 } as const;
const AttestationType = { INGREDIENT_RECEIVED: 0, PACKED: 4 } as const;
const ZERO_HASH = `0x${"0".repeat(64)}` as const;

const h = (label: string) => keccak256(toBytes(label));
const BATCH_ID = h("SANDBOX-2026-001");
const RECORD_V1 = h("sandbox-v1");
const RECORD_V2 = h("sandbox-v2");
const REASON = h("reason");

describe("KimchiProvenanceSandbox", async () => {
  const { viem } = await network.create();
  const [adminClient, strangerClient, otherClient] = await viem.getWalletClients();

  const admin = adminClient.account.address;
  const stranger = strangerClient.account.address;

  async function deploy() {
    return viem.deployContract("KimchiProvenanceSandbox", [admin]);
  }

  // -------------------------------------------------------------------
  describe("open registration", () => {
    it("declares itself open on-chain", async () => {
      const contract = await deploy();

      assert.equal(await contract.read.OPEN_REGISTRATION(), true);
    });

    it("reports every account as a verifier", async () => {
      const contract = await deploy();
      const verifierRole = await contract.read.VERIFIER_ROLE();

      assert.equal(await contract.read.hasRole([verifierRole, stranger]), true);
      assert.equal(
        await contract.read.hasRole([
          verifierRole,
          "0x000000000000000000000000000000000000dEaD",
        ]),
        true,
      );
    });

    it("lets a wallet with no granted role register a batch", async () => {
      const contract = await deploy();

      await contract.write.registerBatch(
        [RECORD_V1, BATCH_ID, ZERO_HASH, BatchStatus.ACTIVE, ""],
        { account: strangerClient.account },
      );

      const record = await contract.read.getBatch([RECORD_V1]);
      // Attribution still records who actually signed it.
      assert.equal(record.issuer.toLowerCase(), stranger.toLowerCase());
    });

    it("lets a stranger append attestations", async () => {
      const contract = await deploy();
      await contract.write.registerBatch(
        [RECORD_V1, BATCH_ID, ZERO_HASH, BatchStatus.ACTIVE, ""],
        { account: strangerClient.account },
      );

      await contract.write.addAttestation(
        [RECORD_V1, h("a1"), AttestationType.PACKED, ""],
        { account: otherClient.account },
      );

      assert.equal(await contract.read.attestationCount([RECORD_V1]), 1);
    });

    it("lets a stranger change status", async () => {
      const contract = await deploy();
      await contract.write.registerBatch(
        [RECORD_V1, BATCH_ID, ZERO_HASH, BatchStatus.ACTIVE, ""],
        { account: strangerClient.account },
      );

      await contract.write.updateBatchStatus(
        [RECORD_V1, BatchStatus.RECALLED, REASON, ""],
        { account: otherClient.account },
      );

      assert.equal(await contract.read.getBatchStatus([RECORD_V1]), BatchStatus.RECALLED);
    });
  });

  // -------------------------------------------------------------------
  describe("opening the gate opened nothing else", () => {
    it("does not let a stranger pause the registry", async () => {
      const contract = await deploy();

      await viem.assertions.revertWithCustomError(
        contract.write.pause({ account: strangerClient.account }),
        contract,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("does not let a stranger grant roles", async () => {
      const contract = await deploy();
      const pauserRole = await contract.read.PAUSER_ROLE();

      await viem.assertions.revertWithCustomError(
        contract.write.grantRole([pauserRole, stranger], {
          account: strangerClient.account,
        }),
        contract,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("still reports admin and pauser truthfully", async () => {
      const contract = await deploy();
      const adminRole = await contract.read.DEFAULT_ADMIN_ROLE();
      const pauserRole = await contract.read.PAUSER_ROLE();

      assert.equal(await contract.read.hasRole([adminRole, stranger]), false);
      assert.equal(await contract.read.hasRole([pauserRole, stranger]), false);
      assert.equal(await contract.read.hasRole([adminRole, admin]), true);
    });

    it("an admin pause still stops everyone", async () => {
      const contract = await deploy();
      await contract.write.pause();

      await viem.assertions.revertWithCustomError(
        contract.write.registerBatch(
          [RECORD_V1, BATCH_ID, ZERO_HASH, BatchStatus.ACTIVE, ""],
          { account: strangerClient.account },
        ),
        contract,
        "EnforcedPause",
      );
    });
  });

  // -------------------------------------------------------------------
  describe("every integrity guarantee still holds", () => {
    async function withBatch() {
      const contract = await deploy();
      await contract.write.registerBatch(
        [RECORD_V1, BATCH_ID, ZERO_HASH, BatchStatus.ACTIVE, ""],
        { account: strangerClient.account },
      );
      return contract;
    }

    it("rejects a duplicate record hash", async () => {
      const contract = await withBatch();

      await viem.assertions.revertWithCustomError(
        contract.write.registerBatch(
          [RECORD_V1, BATCH_ID, ZERO_HASH, BatchStatus.ACTIVE, ""],
          { account: otherClient.account },
        ),
        contract,
        "BatchAlreadyRegistered",
      );
    });

    it("rejects a duplicate attestation hash", async () => {
      const contract = await withBatch();
      await contract.write.addAttestation([RECORD_V1, h("a1"), AttestationType.PACKED, ""]);

      await viem.assertions.revertWithCustomError(
        contract.write.addAttestation([RECORD_V1, h("a1"), AttestationType.PACKED, ""], {
          account: otherClient.account,
        }),
        contract,
        "AttestationAlreadyRecorded",
      );
    });

    it("keeps RECALLED terminal", async () => {
      const contract = await withBatch();
      await contract.write.updateBatchStatus([RECORD_V1, BatchStatus.RECALLED, REASON, ""]);

      await viem.assertions.revertWithCustomError(
        contract.write.updateBatchStatus([RECORD_V1, BatchStatus.ACTIVE, REASON, ""]),
        contract,
        "InvalidStatusTransition",
      );
    });

    it("keeps superseded records readable and linked", async () => {
      const contract = await withBatch();
      await contract.write.registerBatch(
        [RECORD_V2, BATCH_ID, RECORD_V1, BatchStatus.ACTIVE, ""],
        { account: otherClient.account },
      );

      const v1 = await contract.read.getBatch([RECORD_V1]);
      assert.equal(v1.supersededByRecordHash, RECORD_V2);
      assert.equal(v1.status, BatchStatus.SUPERSEDED);
      assert.equal(await contract.read.versionCount([BATCH_ID]), 2n);
    });

    it("still refuses to register directly as RECALLED", async () => {
      const contract = await deploy();

      await viem.assertions.revertWithCustomError(
        contract.write.registerBatch(
          [RECORD_V1, BATCH_ID, ZERO_HASH, BatchStatus.RECALLED, ""],
          { account: strangerClient.account },
        ),
        contract,
        "InvalidInitialStatus",
      );
    });

    it("still rejects a zero record hash", async () => {
      const contract = await deploy();

      await viem.assertions.revertWithCustomError(
        contract.write.registerBatch(
          [ZERO_HASH, BATCH_ID, ZERO_HASH, BatchStatus.ACTIVE, ""],
          { account: strangerClient.account },
        ),
        contract,
        "ZeroHash",
      );
    });
  });
});
