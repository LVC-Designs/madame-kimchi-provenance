/**
 * Batch lifecycle status pill.
 *
 * The four names mirror the `BatchStatus` enum in `contracts/KimchiProvenance.sol`,
 * which is the source of truth on disk today. When `src/lib/schema.ts` lands it
 * should export the tuple and this union should be replaced by that inferred
 * type rather than kept in parallel.
 */
export type BatchStatusName = "ACTIVE" | "QUARANTINED" | "RECALLED" | "SUPERSEDED";

/**
 * QUARANTINED and RECALLED are the only statuses that earn red. ACTIVE is
 * deliberately quiet — a batch being registered and unmodified is the normal
 * case, and dressing it up as a green pass would read as an endorsement of the
 * contents, which is precisely the claim this product does not make.
 */
const STYLES: Record<BatchStatusName, { className: string; label: string }> = {
  ACTIVE: {
    className: "border-ink-600 bg-ink-800 text-ink-200",
    label: "Active",
  },
  QUARANTINED: {
    className: "border-alert-600/70 bg-alert-950 text-alert-300",
    label: "Quarantined",
  },
  RECALLED: {
    className: "border-alert-500 bg-alert-800 text-alert-200",
    label: "Recalled",
  },
  SUPERSEDED: {
    className: "border-ink-700 bg-ink-850 text-ink-400",
    label: "Superseded",
  },
};

export function StatusBadge({ status }: { status: BatchStatusName }) {
  const { className, label } = STYLES[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] ${className}`}
    >
      {label}
    </span>
  );
}
