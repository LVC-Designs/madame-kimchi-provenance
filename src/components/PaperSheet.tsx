import type { ReactNode } from "react";

/**
 * Warm label stock. Carries product and batch narrative — the human-readable
 * half of a Batch Passport.
 *
 * Deliberately the opposite surface to `AuditPanel`. Anything a shopper would
 * read belongs on paper; anything a verifier would check belongs on ink.
 */
export function PaperSheet({
  children,
  eyebrow,
  className = "",
  ruled = false,
}: {
  children: ReactNode;
  /** Small caps kicker printed into the label's top edge. */
  eyebrow?: string;
  className?: string;
  /** Ledger rules, for tabulated record surfaces. */
  ruled?: boolean;
}) {
  return (
    <section
      className={`paper-grain ring-paper-400/60 relative overflow-hidden rounded-sm shadow-[0_1px_0_0_rgba(255,255,255,0.35)_inset,0_18px_40px_-24px_rgba(0,0,0,0.9)] ring-1 ${className}`}
    >
      <div className="label-perforation h-[3px] w-full opacity-70" aria-hidden />

      {eyebrow !== undefined && (
        <div className="border-paper-300/80 flex items-center justify-between border-b px-6 pt-4 pb-3">
          <span className="text-paper-700 font-mono text-[11px] font-semibold uppercase tracking-[0.2em]">
            {eyebrow}
          </span>
          <span className="bg-paper-400/70 h-px flex-1 ml-4" aria-hidden />
        </div>
      )}

      <div className={`text-paper-900 px-6 py-6 ${ruled ? "ledger-rules" : ""}`}>
        {children}
      </div>
    </section>
  );
}
