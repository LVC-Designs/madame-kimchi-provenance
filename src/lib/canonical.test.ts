import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  CanonicalizationError,
  batchIdHash,
  canonicalHash,
  canonicalize,
  parseCanonicalJson,
  toCanonicalDownload,
} from "./canonical.ts";
import { BatchMetadataSchema } from "./schema.ts";

const FIXTURE_PATH = new URL("../../public/demo-batch.json", import.meta.url);

/**
 * The demo batch's canonical hash, pinned.
 *
 * The fixture's `generatedAt` is a fixed literal precisely so this value is
 * stable and reproducible on any machine. If this assertion ever fails, either
 * the fixture changed or the canonicalization rules did — both are things that
 * must be noticed deliberately, never absorbed silently.
 */
const DEMO_RECORD_HASH =
  "0x530be5d0882872eb58d27cab161bddeecf5448f751de0a23e4e6e003a6ec779a";

function loadFixture(): Record<string, unknown> {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Record<string, unknown>;
}

function hashOf(raw: unknown): string {
  return canonicalHash(BatchMetadataSchema.parse(raw));
}

describe("canonical hashing", () => {
  // -------------------------------------------------------------------
  describe("invariance — presentation must not change the hash", () => {
    it("key order does not change the hash", () => {
      const raw = loadFixture();
      const reversed = Object.fromEntries(Object.entries(raw).reverse());

      assert.notDeepEqual(Object.keys(raw), Object.keys(reversed));
      assert.equal(hashOf(reversed), hashOf(raw));
    });

    it("nested key order does not change the hash", () => {
      const raw = loadFixture();
      const nested = structuredClone(raw);
      nested.ingredientOrigins = (
        raw.ingredientOrigins as Record<string, unknown>[]
      ).map((origin) => Object.fromEntries(Object.entries(origin).reverse()));

      assert.equal(hashOf(nested), hashOf(raw));
    });

    it("indentation does not change the hash", () => {
      const raw = loadFixture();

      const compact = parseCanonicalJson(JSON.stringify(raw));
      const twoSpace = parseCanonicalJson(JSON.stringify(raw, null, 2));
      const fourSpace = parseCanonicalJson(JSON.stringify(raw, null, 4));
      const tabbed = parseCanonicalJson(JSON.stringify(raw, null, "\t"));

      const expected = hashOf(raw);
      assert.equal(hashOf(compact), expected);
      assert.equal(hashOf(twoSpace), expected);
      assert.equal(hashOf(fourSpace), expected);
      assert.equal(hashOf(tabbed), expected);
    });

    it("trailing newlines do not change the hash", () => {
      const text = JSON.stringify(loadFixture());
      const expected = hashOf(parseCanonicalJson(text));

      assert.equal(hashOf(parseCanonicalJson(`${text}\n`)), expected);
      assert.equal(hashOf(parseCanonicalJson(`${text}\n\n\n`)), expected);
      assert.equal(hashOf(parseCanonicalJson(`\n  ${text}  \n`)), expected);
    });

    it("CRLF versus LF inside a string value does not change the hash", () => {
      const raw = loadFixture();

      const lf = structuredClone(raw);
      lf.notes = "First line.\nSecond line.\nThird line.";

      const crlf = structuredClone(raw);
      crlf.notes = "First line.\r\nSecond line.\r\nThird line.";

      const cr = structuredClone(raw);
      cr.notes = "First line.\rSecond line.\rThird line.";

      const expected = hashOf(lf);
      assert.equal(hashOf(crlf), expected);
      assert.equal(hashOf(cr), expected);
    });

    it("CRLF between JSON tokens does not change the hash", () => {
      const raw = loadFixture();
      const withCrlf = JSON.stringify(raw, null, 2).replace(/\n/g, "\r\n");

      assert.equal(hashOf(parseCanonicalJson(withCrlf)), hashOf(raw));
    });

    it("Unicode normalization does not change the hash — Hangul", () => {
      const raw = loadFixture();

      // 김치 as precomposed syllables (U+AE40 U+CE58)...
      const precomposed = structuredClone(raw);
      precomposed.productName = "Madame 김치 Original";

      // ...and as decomposed conjoining jamo. Same word, different code points.
      const decomposed = structuredClone(raw);
      decomposed.productName = "Madame 김치 Original";

      assert.notEqual(precomposed.productName, decomposed.productName);
      assert.equal(hashOf(decomposed), hashOf(precomposed));
    });

    it("Unicode normalization does not change the hash — Latin accents", () => {
      const raw = loadFixture();

      const nfc = structuredClone(raw);
      nfc.facilityName = "Fermentation Roóm";

      const nfd = structuredClone(raw);
      nfd.facilityName = "Fermentation Roóm";

      assert.notEqual(nfc.facilityName, nfd.facilityName);
      assert.equal(hashOf(nfd), hashOf(nfc));
    });

    it("normalizes object keys too, not only values", () => {
      const composed = { schemaVersion: 1, "café": "x" };
      const decomposed = { schemaVersion: 1, "café": "x" };

      assert.equal(canonicalHash(decomposed), canonicalHash(composed));
    });

    it("a byte-order mark does not change the hash", () => {
      const text = JSON.stringify(loadFixture());

      assert.equal(hashOf(parseCanonicalJson(`﻿${text}`)), hashOf(parseCanonicalJson(text)));
    });
  });

  // -------------------------------------------------------------------
  describe("sensitivity — meaning must change the hash", () => {
    it("a one-character change to a field changes the hash", () => {
      const raw = loadFixture();
      const tampered = structuredClone(raw);
      tampered.lotNumber = "L-2026-015";

      assert.notEqual(hashOf(tampered), hashOf(raw));
    });

    it("a changed date changes the hash", () => {
      const raw = loadFixture();
      const tampered = structuredClone(raw);
      tampered.bestBeforeDate = "2026-07-28";

      assert.notEqual(hashOf(tampered), hashOf(raw));
    });

    it("reordering an array changes the hash, because order is semantic", () => {
      const raw = loadFixture();
      const reordered = structuredClone(raw);
      reordered.ingredientOrigins = [
        ...(raw.ingredientOrigins as unknown[]),
      ].reverse();

      assert.notEqual(hashOf(reordered), hashOf(raw));
    });

    it("null and an empty string are different records", () => {
      assert.notEqual(
        canonicalHash({ schemaVersion: 1, a: null }),
        canonicalHash({ schemaVersion: 1, a: "" }),
      );
    });

    it("an added field changes the hash", () => {
      assert.notEqual(
        canonicalHash({ schemaVersion: 1, a: "x", b: "y" }),
        canonicalHash({ schemaVersion: 1, a: "x" }),
      );
    });
  });

  // -------------------------------------------------------------------
  describe("rejections", () => {
    it("rejects a missing schemaVersion", () => {
      assert.throws(() => canonicalize({ a: 1 }), CanonicalizationError);
    });

    it("rejects a non-integer schemaVersion", () => {
      assert.throws(() => canonicalize({ schemaVersion: 1.5 }), CanonicalizationError);
    });

    it("rejects a non-object root", () => {
      assert.throws(() => canonicalize([1, 2, 3]), CanonicalizationError);
      assert.throws(() => canonicalize("string"), CanonicalizationError);
    });

    it("rejects NaN and Infinity", () => {
      assert.throws(() => canonicalize({ schemaVersion: 1, a: NaN }), CanonicalizationError);
      assert.throws(
        () => canonicalize({ schemaVersion: 1, a: Infinity }),
        CanonicalizationError,
      );
    });

    it("rejects undefined rather than dropping the key", () => {
      assert.throws(
        () => canonicalize({ schemaVersion: 1, a: undefined }),
        CanonicalizationError,
      );
    });

    it("rejects BigInt", () => {
      assert.throws(
        () => canonicalize({ schemaVersion: 1, a: 1n }),
        CanonicalizationError,
      );
    });

    it("rejects Date objects, so timezones stay explicit in the bytes", () => {
      assert.throws(
        () => canonicalize({ schemaVersion: 1, a: new Date(0) }),
        CanonicalizationError,
      );
    });

    it("rejects keys that collide after normalization", () => {
      assert.throws(
        () => canonicalize({ schemaVersion: 1, "café": 1, "café": 2 }),
        CanonicalizationError,
      );
    });
  });

  // -------------------------------------------------------------------
  describe("output shape", () => {
    it("emits no insignificant whitespace", () => {
      const output = canonicalize({ schemaVersion: 1, b: 1, a: [1, 2] });

      assert.equal(output, '{"a":[1,2],"b":1,"schemaVersion":1}');
    });

    it("sorts keys recursively", () => {
      const output = canonicalize({ schemaVersion: 1, z: { c: 1, a: 2 } });

      assert.equal(output, '{"schemaVersion":1,"z":{"a":2,"c":1}}');
    });

    it("batchIdHash is stable and normalization-insensitive", () => {
      assert.equal(batchIdHash("MK-DEMO-2026-001"), batchIdHash("MK-DEMO-2026-001"));
      assert.equal(batchIdHash("café"), batchIdHash("café"));
      assert.notEqual(batchIdHash("MK-DEMO-2026-001"), batchIdHash("MK-DEMO-2026-002"));
    });
  });

  // -------------------------------------------------------------------
  describe("demo fixture", () => {
    it("validates against the schema", () => {
      assert.doesNotThrow(() => BatchMetadataSchema.parse(loadFixture()));
    });

    it("hashes to the pinned record hash", () => {
      assert.equal(hashOf(loadFixture()), DEMO_RECORD_HASH);
    });

    it("carries the demo marker in its notes", () => {
      const metadata = BatchMetadataSchema.parse(loadFixture());

      assert.ok(metadata.notes?.startsWith("DEMO DATA — NOT A COMMERCIAL BATCH"));
    });

    it("downloads the exact bytes that were hashed", () => {
      const metadata = BatchMetadataSchema.parse(loadFixture());
      const { filename, contents } = toCanonicalDownload(metadata);

      assert.equal(filename, "MK-DEMO-2026-001.canonical.json");
      assert.equal(contents, canonicalize(metadata));
      // Round-tripping the download must reproduce the same hash.
      assert.equal(hashOf(parseCanonicalJson(contents)), DEMO_RECORD_HASH);
    });

    it("publishes no document bytes or URIs it is not authorized to publish", () => {
      const metadata = BatchMetadataSchema.parse(loadFixture());

      for (const document of metadata.documentReferences) {
        assert.equal(document.uri, null);
        assert.match(document.sha256, /^0x[0-9a-f]{64}$/);
      }
    });
  });
});
