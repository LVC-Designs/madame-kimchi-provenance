import { MONAD_TESTNET_EXPLORER_URL } from "@/lib/monad";

/**
 * The three distinctions CLAUDE.md requires the interface to keep separate.
 *
 * They sit in the footer of every page because the difference between "an
 * authorized verifier registered this" and "this is true" is the single claim
 * most likely to be misread, and it should not depend on the visitor having
 * scrolled the right panel on the right screen.
 */
const CLAIMS = [
  {
    heading: "Registered by an authorized verifier",
    body: "A wallet holding the verifier role submitted this record to Monad Testnet. Who holds that role is a matter of trust in Madame Kimchi, not cryptography.",
    tone: "ink",
  },
  {
    heading: "Cryptographically unchanged",
    body: "The published metadata still hashes to the value recorded on-chain. Any edit to any field produces a different hash and is visible immediately.",
    tone: "crypto",
  },
  {
    heading: "Not independently validated for truth or food safety",
    body: "Nothing here verifies the contents of a document, the safety of a product, or that a physical jar matches its record. A hash proves what was published, not that it is true.",
    tone: "ink",
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-ink-800 bg-ink-900 mt-20 border-t">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="flex items-center gap-3">
          {/* Identity rule, not a status indicator. */}
          <span className="bg-brand-green h-px w-8 shrink-0" aria-hidden />
          <h2 className="text-ink-400 font-mono text-[11px] font-semibold uppercase tracking-[0.2em]">
            What a Batch Passport does and does not establish
          </h2>
        </div>

        <dl className="mt-6 grid gap-6 md:grid-cols-3">
          {CLAIMS.map((claim) => (
            <div
              key={claim.heading}
              className={`border-l-2 pl-4 ${
                claim.tone === "crypto" ? "border-monad-600" : "border-ink-700"
              }`}
            >
              <dt
                className={`font-serif text-[15px] leading-snug ${
                  claim.tone === "crypto" ? "text-monad-200" : "text-ink-200"
                }`}
              >
                {claim.heading}
              </dt>
              <dd className="text-ink-400 mt-2 text-[13px] leading-relaxed">
                {claim.body}
              </dd>
            </div>
          ))}
        </dl>

        <div className="border-ink-800 mt-10 flex flex-wrap items-center justify-between gap-4 border-t pt-6">
          <p className="text-ink-400 max-w-xl text-xs leading-relaxed">
            Monad Testnet prototype. Not a token, not an investment, not a
            food-safety certification, and not approved for production use.
            Testnet records carry no commercial or regulatory standing and may be
            reset without notice.
          </p>
          <a
            href={MONAD_TESTNET_EXPLORER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-monad-400 hover:text-monad-300 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors"
          >
            Block explorer ↗
          </a>
        </div>
      </div>
    </footer>
  );
}
