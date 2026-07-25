import type { ButtonHTMLAttributes, ReactNode } from "react";

type Tone = "primary" | "crypto" | "ghost" | "alert";

const TONES: Record<Tone, string> = {
  /** Ordinary forward action on ink chrome. */
  primary:
    "bg-paper-100 text-ink-950 hover:bg-white disabled:bg-ink-700 disabled:text-ink-400",
  /** Cryptographic or explorer action. Purple is rationed to these. */
  crypto:
    "border border-monad-600/60 text-monad-300 hover:bg-monad-950/60 hover:border-monad-500 disabled:border-ink-700 disabled:text-ink-400 disabled:hover:bg-transparent",
  ghost:
    "border border-ink-700 text-ink-300 hover:border-ink-600 hover:text-paper-100 disabled:border-ink-800 disabled:text-ink-400",
  /** Recall, quarantine, destructive. */
  alert:
    "border border-alert-600 text-alert-300 hover:bg-alert-950 disabled:border-ink-700 disabled:text-ink-400",
};

export function Button({
  children,
  tone = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; tone?: Tone }) {
  return (
    <button
      {...props}
      className={`rounded-sm px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors disabled:cursor-not-allowed ${TONES[tone]} ${className}`}
    >
      {children}
    </button>
  );
}
