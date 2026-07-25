/**
 * Field-level comparison between a registered document and a local one.
 *
 * Used only to explain a hash mismatch. The hash already established *that*
 * something differs; this says *where*, so a verifier can see it is a typo in a
 * lot number rather than something worse — or the reverse.
 *
 * The wording throughout the interface is deliberate: a mismatch means the file
 * differs from the registered version. It does not establish who changed it,
 * when, or why, and the difference may well be innocent — a re-save through a
 * tool that rewrote a date, or an older copy of the document. Nothing here
 * supports an accusation.
 */

export interface FieldDifference {
  /** Dot/bracket path, e.g. `ingredientOrigins[1].originRegion`. */
  path: string;
  /** Value in the document registered on-chain. */
  registered: string;
  /** Value in the file being checked. */
  candidate: string;
  kind: "changed" | "added" | "removed";
}

const ABSENT = Symbol("absent");

function render(value: unknown): string {
  if (value === ABSENT) return "—";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function walk(
  registered: unknown,
  candidate: unknown,
  path: string,
  out: FieldDifference[],
): void {
  if (registered === candidate) return;

  // Both objects: recurse over the union of their keys.
  if (isPlainObject(registered) && isPlainObject(candidate)) {
    const keys = [...new Set([...Object.keys(registered), ...Object.keys(candidate)])].sort();
    for (const key of keys) {
      const nextPath = path === "" ? key : `${path}.${key}`;
      const inRegistered = Object.hasOwn(registered, key);
      const inCandidate = Object.hasOwn(candidate, key);

      if (!inRegistered) {
        out.push({
          path: nextPath,
          registered: render(ABSENT),
          candidate: render(candidate[key]),
          kind: "added",
        });
      } else if (!inCandidate) {
        out.push({
          path: nextPath,
          registered: render(registered[key]),
          candidate: render(ABSENT),
          kind: "removed",
        });
      } else {
        walk(registered[key], candidate[key], nextPath, out);
      }
    }
    return;
  }

  // Both arrays: compare position by position. Order is semantic in these
  // documents, so a reordered list is a real difference, not a false positive.
  if (Array.isArray(registered) && Array.isArray(candidate)) {
    const length = Math.max(registered.length, candidate.length);
    for (let index = 0; index < length; index += 1) {
      const nextPath = `${path}[${index}]`;
      if (index >= registered.length) {
        out.push({
          path: nextPath,
          registered: render(ABSENT),
          candidate: render(candidate[index]),
          kind: "added",
        });
      } else if (index >= candidate.length) {
        out.push({
          path: nextPath,
          registered: render(registered[index]),
          candidate: render(ABSENT),
          kind: "removed",
        });
      } else {
        walk(registered[index], candidate[index], nextPath, out);
      }
    }
    return;
  }

  out.push({
    path: path === "" ? "(root)" : path,
    registered: render(registered),
    candidate: render(candidate),
    kind: "changed",
  });
}

/**
 * Every field where the local document differs from the registered one.
 *
 * Empty when the two are deeply equal — which, given both have already been
 * through the schema, means they will also canonicalize identically.
 */
export function diffMetadata(registered: unknown, candidate: unknown): FieldDifference[] {
  const differences: FieldDifference[] = [];
  walk(registered, candidate, "", differences);
  return differences;
}
