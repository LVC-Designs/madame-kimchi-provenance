import type { ReactNode } from "react";

/**
 * A short status message with an optional action.
 *
 * `crypto` is Monad purple and belongs to cryptographic or explorer statements.
 * `alert` is red and belongs to quarantine, recall, tamper failure, and blocked
 * actions. Everything else is `info`.
 */
export function Notice({
  tone,
  title,
  children,
  action,
}: {
  tone: "info" | "crypto" | "alert";
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const tones = {
    info: "border-ink-700 bg-ink-900 text-ink-300",
    crypto: "border-monad-700/50 bg-monad-950/40 text-monad-200",
    alert: "border-alert-600/60 bg-alert-950/50 text-alert-200",
  } as const;

  return (
    <div className={`rounded-sm border px-4 py-3.5 ${tones[tone]}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">
            {title}
          </p>
          {children !== undefined && (
            <div className="mt-1.5 text-[12px] leading-relaxed opacity-90">{children}</div>
          )}
        </div>
        {action}
      </div>
    </div>
  );
}
