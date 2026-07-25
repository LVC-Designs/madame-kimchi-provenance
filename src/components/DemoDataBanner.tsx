/**
 * Global demonstration notice.
 *
 * Rendered in the root layout rather than per page, because CLAUDE.md requires
 * this label on every screen and a per-page banner is one forgotten import away
 * from a screen that looks like a commercial record.
 *
 * Warm paper stock rather than red: red is reserved for recall, quarantine, and
 * tamper failure, and spending it on a standing notice would blunt it exactly
 * where it has to cut.
 */
export function DemoDataBanner() {
  return (
    <div className="bg-paper-200 text-paper-900">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em]">
          Demo data — not a commercial batch
        </span>
        <span className="text-paper-700 text-xs">
          Monad Testnet demonstration. Fictional product records, no commercial
          or regulatory standing.
        </span>
      </div>
    </div>
  );
}
