import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  ATTESTATION_TYPES,
  AttestationMetadataSchema,
  BATCH_STATUSES,
  BatchMetadataSchema,
  attestationTypeIndex,
  batchStatusIndex,
  safeParseBatchMetadata,
} from "./schema.ts";

const FIXTURE_PATH = new URL("../../public/demo-batch.json", import.meta.url);

function fixture(): Record<string, unknown> {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Record<string, unknown>;
}

/** The fixture with one field replaced — the shape every rejection test needs. */
function withField(key: string, value: unknown): Record<string, unknown> {
  return { ...fixture(), [key]: value };
}

function rejects(value: unknown): boolean {
  return !safeParseBatchMetadata(value).success;
}

describe("batch metadata schema", () => {
  it("accepts the demo fixture", () => {
    assert.equal(safeParseBatchMetadata(fixture()).success, true);
  });

  // -------------------------------------------------------------------
  describe("unknown keys", () => {
    it("rejects an added field, so tampering cannot hide in an extra key", () => {
      assert.ok(rejects({ ...fixture(), injectedField: "anything" }));
    });

    it("rejects an unknown key inside a nested object", () => {
      const raw = fixture();
      raw.documentReferences = [
        { ...(raw.documentReferences as Record<string, unknown>[])[0], extra: 1 },
      ];

      assert.ok(rejects(raw));
    });
  });

  // -------------------------------------------------------------------
  describe("hashes", () => {
    it("rejects an uppercase hash rather than folding its case", () => {
      assert.ok(rejects(withField("supersedesRecordHash", `0x${"A".repeat(64)}`)));
    });

    it("accepts a lowercase 32-byte hash", () => {
      assert.equal(
        safeParseBatchMetadata(withField("supersedesRecordHash", `0x${"a".repeat(64)}`))
          .success,
        true,
      );
    });

    it("rejects a hash that is one character short", () => {
      assert.ok(rejects(withField("supersedesRecordHash", `0x${"a".repeat(63)}`)));
    });

    it("rejects a hash with no 0x prefix", () => {
      assert.ok(rejects(withField("supersedesRecordHash", "a".repeat(64))));
    });

    it("rejects a malformed document digest", () => {
      const raw = fixture();
      raw.documentReferences = [
        {
          ...(raw.documentReferences as Record<string, unknown>[])[0],
          sha256: "0xnothex",
        },
      ];

      assert.ok(rejects(raw));
    });
  });

  // -------------------------------------------------------------------
  describe("dates and instants", () => {
    it("rejects a datetime where a calendar date belongs", () => {
      assert.ok(rejects(withField("productionDate", "2026-01-12T00:00:00Z")));
    });

    it("rejects a calendar date where an instant belongs", () => {
      assert.ok(rejects(withField("fermentationStart", "2026-01-12")));
    });

    it("rejects a UTC offset, so one moment has one spelling", () => {
      assert.ok(rejects(withField("fermentationStart", "2026-01-12T10:30:00+01:00")));
    });

    it("accepts an instant in UTC", () => {
      assert.equal(
        safeParseBatchMetadata(withField("fermentationStart", "2026-01-12T09:30:00Z"))
          .success,
        true,
      );
    });

    it("rejects fermentation ending before it starts", () => {
      assert.ok(rejects(withField("fermentationEnd", "2026-01-01T00:00:00Z")));
    });

    it("rejects packing before production", () => {
      assert.ok(rejects(withField("packedDate", "2026-01-01")));
    });

    it("rejects a best-before on or before the packed date", () => {
      assert.ok(rejects(withField("bestBeforeDate", "2026-01-27")));
      assert.ok(rejects(withField("bestBeforeDate", "2026-01-26")));
    });

    it("accepts a null fermentationEnd for a batch still fermenting", () => {
      assert.equal(
        safeParseBatchMetadata(withField("fermentationEnd", null)).success,
        true,
      );
    });
  });

  // -------------------------------------------------------------------
  describe("enums and versioning", () => {
    it("rejects an unknown status", () => {
      assert.ok(rejects(withField("status", "APPROVED")));
    });

    it("accepts every declared status", () => {
      for (const status of BATCH_STATUSES) {
        assert.equal(safeParseBatchMetadata(withField("status", status)).success, true);
      }
    });

    it("rejects a missing schemaVersion", () => {
      const raw = fixture();
      delete raw.schemaVersion;

      assert.ok(rejects(raw));
    });

    it("rejects a schemaVersion this build does not implement", () => {
      assert.ok(rejects(withField("schemaVersion", 2)));
      assert.ok(rejects(withField("schemaVersion", "1")));
    });
  });

  // -------------------------------------------------------------------
  describe("nullable means present-and-null, never absent", () => {
    it("rejects an omitted nullable key", () => {
      const raw = fixture();
      delete raw.facilityName;

      assert.ok(rejects(raw));
    });

    it("accepts the same key set to null", () => {
      assert.equal(safeParseBatchMetadata(withField("facilityName", null)).success, true);
    });
  });

  // -------------------------------------------------------------------
  describe("identifiers", () => {
    it("rejects a lowercase batch id", () => {
      assert.ok(rejects(withField("batchId", "mk-demo-2026-001")));
    });

    it("rejects a batch id with spaces", () => {
      assert.ok(rejects(withField("batchId", "MK DEMO 001")));
    });

    it("rejects an empty product name", () => {
      assert.ok(rejects(withField("productName", "   ")));
    });

    it("rejects a non-URL public URI", () => {
      const raw = fixture();
      raw.certificationReferences = [
        {
          ...(raw.certificationReferences as Record<string, unknown>[])[0],
          uri: "not a url",
        },
      ];

      assert.ok(rejects(raw));
    });
  });
});

describe("attestation metadata schema", () => {
  const valid = {
    schemaVersion: 1,
    attestationType: "FERMENTATION_STARTED",
    batchRecordHash: `0x${"a".repeat(64)}`,
    occurredAt: "2026-01-12T09:30:00Z",
    location: "Demonstration Fermentation Room 2",
    measurements: [{ label: "Temperature", value: "4", unit: "C" }],
    documentReferences: [],
    correctsAttestationHash: null,
    notes: null,
    generatedAt: "2026-01-12T09:35:00Z",
  };

  it("accepts a well-formed attestation", () => {
    assert.equal(AttestationMetadataSchema.safeParse(valid).success, true);
  });

  it("rejects an unknown attestation type", () => {
    assert.equal(
      AttestationMetadataSchema.safeParse({ ...valid, attestationType: "TASTED" }).success,
      false,
    );
  });

  it("accepts every declared attestation type", () => {
    for (const type of ATTESTATION_TYPES) {
      assert.equal(
        AttestationMetadataSchema.safeParse({ ...valid, attestationType: type }).success,
        true,
      );
    }
  });

  it("rejects an unknown key", () => {
    assert.equal(
      AttestationMetadataSchema.safeParse({ ...valid, extra: true }).success,
      false,
    );
  });

  it("rejects a malformed batch record hash", () => {
    assert.equal(
      AttestationMetadataSchema.safeParse({ ...valid, batchRecordHash: "0x00" }).success,
      false,
    );
  });
});

describe("Solidity enum alignment", () => {
  /**
   * These indices are the ABI contract between this schema and
   * `KimchiProvenance.sol`. Reordering either list without the other would send
   * a valid-looking transaction that records the wrong status.
   */
  it("maps batch statuses to their Solidity indices", () => {
    assert.equal(batchStatusIndex("ACTIVE"), 0);
    assert.equal(batchStatusIndex("QUARANTINED"), 1);
    assert.equal(batchStatusIndex("RECALLED"), 2);
    assert.equal(batchStatusIndex("SUPERSEDED"), 3);
    assert.equal(BATCH_STATUSES.length, 4);
  });

  it("maps attestation types to their Solidity indices", () => {
    assert.equal(attestationTypeIndex("INGREDIENT_RECEIVED"), 0);
    assert.equal(attestationTypeIndex("FERMENTATION_STARTED"), 1);
    assert.equal(attestationTypeIndex("QUALITY_CHECK"), 3);
    assert.equal(attestationTypeIndex("CORRECTION"), 10);
    assert.equal(ATTESTATION_TYPES.length, 11);
  });
});

describe("BatchMetadataSchema export", () => {
  it("parses and returns typed data", () => {
    const metadata = BatchMetadataSchema.parse(fixture());

    assert.equal(metadata.batchId, "MK-DEMO-2026-001");
    assert.equal(metadata.status, "ACTIVE");
    assert.equal(metadata.supersedesRecordHash, null);
  });
});
