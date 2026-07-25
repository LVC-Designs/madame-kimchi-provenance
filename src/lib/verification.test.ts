import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { canonicalize } from "./canonical.ts";
import { diffMetadata } from "./diff.ts";
import { BatchMetadataSchema } from "./schema.ts";
import { decideOutcome, readCandidate } from "./verification.ts";

const FIXTURE_PATH = new URL("../../public/demo-batch.json", import.meta.url);

const ZERO = `0x${"0".repeat(64)}` as const;

function fixtureText(): string {
  return readFileSync(FIXTURE_PATH, "utf8");
}

function fixture(): Record<string, unknown> {
  return JSON.parse(fixtureText()) as Record<string, unknown>;
}

/** The bytes a verifier actually downloads from the registration screen. */
function canonicalDownload(): string {
  return canonicalize(BatchMetadataSchema.parse(fixture()));
}

describe("independent verification", () => {
  // -------------------------------------------------------------------
  describe("an untouched downloaded document verifies", () => {
    it("accepts the canonical download and reproduces its hash", () => {
      const download = canonicalDownload();
      const candidate = readCandidate(download);

      assert.equal(candidate.ok, true);
      if (!candidate.ok) return;

      // Registered under exactly this hash → VERIFIED.
      assert.equal(
        decideOutcome({
          candidateRegistered: true,
          supersededBy: ZERO,
          batchVersionCount: 1,
        }),
        "VERIFIED",
      );
    });

    it("accepts the pretty-printed fixture as shipped", () => {
      const candidate = readCandidate(fixtureText());

      assert.equal(candidate.ok, true);
    });

    it("the shipped fixture and the canonical download hash identically", () => {
      const fromFixture = readCandidate(fixtureText());
      const fromDownload = readCandidate(canonicalDownload());

      assert.equal(fromFixture.ok && fromDownload.ok, true);
      if (!fromFixture.ok || !fromDownload.ok) return;

      assert.equal(fromFixture.recordHash, fromDownload.recordHash);
    });
  });

  // -------------------------------------------------------------------
  describe("reformatting alone still verifies", () => {
    const baseline = () => {
      const result = readCandidate(fixtureText());
      assert.equal(result.ok, true);
      if (!result.ok) throw new Error("fixture must parse");
      return result.recordHash;
    };

    it("re-indenting does not change the hash", () => {
      const expected = baseline();
      const raw = fixture();

      for (const spacing of [0, 2, 4, 8, "\t"] as const) {
        const reformatted = readCandidate(JSON.stringify(raw, null, spacing));
        assert.equal(reformatted.ok, true);
        if (!reformatted.ok) continue;
        assert.equal(reformatted.recordHash, expected, `spacing ${String(spacing)}`);
      }
    });

    it("reordering keys does not change the hash", () => {
      const expected = baseline();
      const reversed = Object.fromEntries(Object.entries(fixture()).reverse());

      const result = readCandidate(JSON.stringify(reversed));
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.recordHash, expected);
    });

    it("trailing newlines and surrounding whitespace do not change the hash", () => {
      const expected = baseline();
      const text = JSON.stringify(fixture());

      for (const variant of [`${text}\n`, `${text}\n\n\n`, `\n\n  ${text}  \n`]) {
        const result = readCandidate(variant);
        assert.equal(result.ok, true);
        if (!result.ok) continue;
        assert.equal(result.recordHash, expected);
      }
    });

    it("CRLF line endings do not change the hash", () => {
      const expected = baseline();
      const crlf = JSON.stringify(fixture(), null, 2).replace(/\n/g, "\r\n");

      const result = readCandidate(crlf);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.recordHash, expected);
    });

    it("a byte-order mark does not change the hash", () => {
      const expected = baseline();

      const result = readCandidate(`﻿${JSON.stringify(fixture())}`);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.recordHash, expected);
    });

    it("reformatting produces no field-level differences", () => {
      const registered = BatchMetadataSchema.parse(fixture());
      const reformatted = BatchMetadataSchema.parse(
        JSON.parse(JSON.stringify(fixture(), null, 4)),
      );

      assert.deepEqual(diffMetadata(registered, reformatted), []);
    });
  });

  // -------------------------------------------------------------------
  describe("changing one semantic value fails", () => {
    const baseline = () => {
      const result = readCandidate(fixtureText());
      if (!result.ok) throw new Error("fixture must parse");
      return result.recordHash;
    };

    it("a one-character change to the lot number changes the hash", () => {
      const tampered = { ...fixture(), lotNumber: "L-2026-015" };
      const result = readCandidate(JSON.stringify(tampered));

      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.notEqual(result.recordHash, baseline());
    });

    it("an unregistered hash on a registered batch reads as MODIFIED", () => {
      assert.equal(
        decideOutcome({
          candidateRegistered: false,
          supersededBy: null,
          batchVersionCount: 1,
        }),
        "MODIFIED",
      );
    });

    it("reports the changed field, and only that field", () => {
      const registered = BatchMetadataSchema.parse(fixture());
      const tampered = BatchMetadataSchema.parse({
        ...fixture(),
        lotNumber: "L-2026-015",
      });

      const differences = diffMetadata(registered, tampered);

      assert.equal(differences.length, 1);
      assert.equal(differences[0].path, "lotNumber");
      assert.equal(differences[0].registered, "L-2026-014");
      assert.equal(differences[0].candidate, "L-2026-015");
      assert.equal(differences[0].kind, "changed");
    });

    it("detects a changed date", () => {
      const registered = BatchMetadataSchema.parse(fixture());
      const tampered = BatchMetadataSchema.parse({
        ...fixture(),
        bestBeforeDate: "2026-08-27",
      });

      const differences = diffMetadata(registered, tampered);
      assert.equal(differences.length, 1);
      assert.equal(differences[0].path, "bestBeforeDate");
    });

    it("detects a change nested inside an array", () => {
      const raw = fixture();
      const origins = raw.ingredientOrigins as Record<string, unknown>[];
      const tampered = {
        ...raw,
        ingredientOrigins: origins.map((origin, index) =>
          index === 1 ? { ...origin, originRegion: "Elsewhere County" } : origin,
        ),
      };

      const differences = diffMetadata(
        BatchMetadataSchema.parse(raw),
        BatchMetadataSchema.parse(tampered),
      );

      assert.equal(differences.length, 1);
      assert.equal(differences[0].path, "ingredientOrigins[1].originRegion");
    });

    it("detects a removed array entry", () => {
      const raw = fixture();
      const origins = raw.ingredientOrigins as unknown[];
      const tampered = { ...raw, ingredientOrigins: origins.slice(0, -1) };

      const differences = diffMetadata(
        BatchMetadataSchema.parse(raw),
        BatchMetadataSchema.parse(tampered),
      );

      assert.equal(differences.length, 1);
      assert.equal(differences[0].kind, "removed");
    });

    it("detects a null replaced by a value", () => {
      const registered = BatchMetadataSchema.parse(fixture());
      const tampered = BatchMetadataSchema.parse({
        ...fixture(),
        supersedesRecordHash: `0x${"a".repeat(64)}`,
      });

      const differences = diffMetadata(registered, tampered);
      assert.equal(differences.length, 1);
      assert.equal(differences[0].registered, "null");
    });
  });

  // -------------------------------------------------------------------
  describe("outcome decisions", () => {
    it("registered and current is VERIFIED", () => {
      assert.equal(
        decideOutcome({ candidateRegistered: true, supersededBy: ZERO, batchVersionCount: 1 }),
        "VERIFIED",
      );
    });

    it("registered but replaced is SUPERSEDED", () => {
      assert.equal(
        decideOutcome({
          candidateRegistered: true,
          supersededBy: `0x${"c".repeat(64)}`,
          batchVersionCount: 2,
        }),
        "SUPERSEDED",
      );
    });

    it("a null forward link is not superseded", () => {
      assert.equal(
        decideOutcome({ candidateRegistered: true, supersededBy: null, batchVersionCount: 1 }),
        "VERIFIED",
      );
    });

    it("unknown hash with nothing registered for the batch is NOT_REGISTERED", () => {
      assert.equal(
        decideOutcome({
          candidateRegistered: false,
          supersededBy: null,
          batchVersionCount: 0,
        }),
        "NOT_REGISTERED",
      );
    });
  });

  // -------------------------------------------------------------------
  describe("invalid format", () => {
    it("rejects text that is not JSON", () => {
      const result = readCandidate("this is not json");

      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.outcome, "INVALID_FORMAT");
    });

    it("rejects JSON that is not batch metadata", () => {
      const result = readCandidate(JSON.stringify({ hello: "world" }));

      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.outcome, "INVALID_FORMAT");
      assert.ok(result.issues.length > 0);
    });

    it("rejects a document with an extra field rather than silently hashing it", () => {
      const result = readCandidate(JSON.stringify({ ...fixture(), sneaky: true }));

      assert.equal(result.ok, false);
    });

    it("reports empty input without pretending a check happened", () => {
      const result = readCandidate("   ");

      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.match(result.summary, /Nothing to check/);
    });

    it("names the offending field so it can be fixed", () => {
      const result = readCandidate(JSON.stringify({ ...fixture(), status: "APPROVED" }));

      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.ok(result.issues.some((issue) => issue.path === "status"));
    });
  });
});
