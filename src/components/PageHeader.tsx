import type { ReactNode } from "react";

/** Shared page title block, so every route opens the same way. */
export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="border-ink-800 flex flex-wrap items-end justify-between gap-6 border-b pb-8">
      <div className="max-w-2xl">
        <p className="text-ink-400 font-mono text-[11px] font-semibold uppercase tracking-[0.2em]">
          {eyebrow}
        </p>
        <h1 className="text-paper-100 mt-3 font-serif text-4xl leading-[1.1] tracking-tight">
          {title}
        </h1>
        {lede !== undefined && (
          <p className="text-ink-300 mt-4 text-[15px] leading-relaxed">{lede}</p>
        )}
      </div>
      {actions !== undefined && <div className="flex gap-3">{actions}</div>}
    </div>
  );
}
