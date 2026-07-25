import type { ReactNode } from "react";

/**
 * Deep ink chrome. Holds verification tools, hashes, and explorer actions —
 * the machine-checkable half of a Batch Passport.
 *
 * The `crypto` tone tints the frame Monad purple and is reserved for panels
 * whose subject really is a cryptographic comparison. The `alert` tone is for
 * quarantine, recall, and tamper failure, and nothing else.
 */
export function AuditPanel({
  children,
  title,
  meta,
  tone = "default",
  className = "",
}: {
  children: ReactNode;
  title?: string;
  /** Right-aligned mono detail in the header rail. */
  meta?: ReactNode;
  tone?: "default" | "crypto" | "alert";
  className?: string;
}) {
  const frames = {
    default: "ring-ink-700/80 bg-ink-900",
    crypto: "ring-monad-700/50 bg-ink-900",
    alert: "ring-alert-600/50 bg-ink-900",
  } as const;

  const rails = {
    default: "border-ink-700/80 text-ink-300",
    crypto: "border-monad-700/40 text-monad-300",
    alert: "border-alert-600/40 text-alert-300",
  } as const;

  return (
    <section className={`overflow-hidden rounded-sm ring-1 ${frames[tone]} ${className}`}>
      {title !== undefined && (
        <header
          className={`flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3 ${rails[tone]}`}
        >
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em]">
            {title}
          </h2>
          {meta !== undefined && <div className="text-ink-400 text-xs">{meta}</div>}
        </header>
      )}
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}
