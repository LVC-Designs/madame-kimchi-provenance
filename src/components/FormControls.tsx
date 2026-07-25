"use client";

import type { ReactNode } from "react";

const CONTROL =
  "w-full rounded-sm border bg-ink-950 px-3 py-2 text-[13px] text-paper-100 transition-colors placeholder:text-ink-400 focus:border-monad-600";

function Shell({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-ink-400 font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">
        {label}
      </span>
      {children}
      {error !== undefined ? (
        // Red here is a failed comparison, which is what the palette reserves it for.
        <span className="text-alert-300 text-[11px] leading-snug">{error}</span>
      ) : hint !== undefined ? (
        <span className="text-ink-400 text-[11px] leading-snug">{hint}</span>
      ) : null}
    </label>
  );
}

export function TextField({
  label,
  value,
  onChange,
  hint,
  error,
  placeholder,
  type = "text",
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  placeholder?: string;
  type?: "text" | "date" | "datetime-local";
  /** Hashes and identifiers are mono; prose is not. */
  mono?: boolean;
}) {
  return (
    <Shell label={label} hint={hint} error={error}>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`${CONTROL} ${mono ? "tabular font-mono" : ""} ${
          error !== undefined ? "border-alert-600" : "border-ink-700"
        }`}
      />
    </Shell>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  hint,
  error,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  rows?: number;
}) {
  return (
    <Shell label={label} hint={hint} error={error}>
      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${CONTROL} resize-y leading-relaxed ${
          error !== undefined ? "border-alert-600" : "border-ink-700"
        }`}
      />
    </Shell>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  error,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
  hint?: string;
  error?: string;
}) {
  return (
    <Shell label={label} hint={hint} error={error}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className={`${CONTROL} font-mono ${
          error !== undefined ? "border-alert-600" : "border-ink-700"
        }`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </Shell>
  );
}

/** A titled group of repeatable rows, with add and remove controls. */
export function RepeatableGroup({
  title,
  hint,
  onAdd,
  addLabel,
  children,
  empty,
}: {
  title: string;
  hint?: string;
  onAdd: () => void;
  addLabel: string;
  children: ReactNode;
  empty?: boolean;
}) {
  return (
    <fieldset className="border-ink-800 rounded-sm border p-4">
      <legend className="text-ink-300 px-2 font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">
        {title}
      </legend>

      {hint !== undefined && (
        <p className="text-ink-400 mb-4 text-[11px] leading-relaxed">{hint}</p>
      )}

      <div className="flex flex-col gap-4">{children}</div>

      {empty === true && (
        <p className="text-ink-400 py-2 text-[12px] italic">None recorded.</p>
      )}

      <button
        type="button"
        onClick={onAdd}
        className="border-ink-700 text-ink-400 hover:border-ink-600 hover:text-paper-100 mt-4 rounded-sm border border-dashed px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors"
      >
        + {addLabel}
      </button>
    </fieldset>
  );
}

export function RepeatableRow({
  index,
  onRemove,
  children,
}: {
  index: number;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <div className="border-ink-800 bg-ink-950/60 rounded-sm border p-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-ink-400 tabular font-mono text-[11px] uppercase tracking-[0.16em]">
          {String(index + 1).padStart(2, "0")}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="text-ink-400 hover:text-alert-300 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors"
        >
          Remove
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}
