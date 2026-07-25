import type { ReactNode } from "react";

/**
 * Mono presentation for hashes, addresses, timestamps, and transaction ids.
 *
 * Everything the chain returns goes through here, so that machine-readable
 * values never sit in the same typeface as the human narrative around them.
 */
export function MonoValue({
  children,
  tone = "default",
  className = "",
}: {
  children: ReactNode;
  /** `crypto` is Monad purple and belongs only on hashes, signatures, and explorer links. */
  tone?: "default" | "crypto" | "muted" | "alert";
  className?: string;
}) {
  const tones = {
    default: "text-ink-200",
    crypto: "text-monad-300",
    muted: "text-ink-400",
    alert: "text-alert-300",
  } as const;

  return (
    <code
      className={`tabular font-mono text-[13px] break-all ${tones[tone]} ${className}`}
    >
      {children}
    </code>
  );
}

/**
 * A labelled value row for audit surfaces: small caps label, mono value.
 */
export function MonoField({
  label,
  children,
  tone = "default",
}: {
  label: string;
  children: ReactNode;
  tone?: "default" | "crypto" | "muted" | "alert";
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-ink-400 font-mono text-[11px] font-medium uppercase tracking-[0.16em]">
        {label}
      </span>
      <MonoValue tone={tone}>{children}</MonoValue>
    </div>
  );
}
