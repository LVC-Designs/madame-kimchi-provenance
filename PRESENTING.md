# Presenting the Batch Passport

A complete walkthrough for a three-minute live demo, plus the plain-English
explanation of what the thing actually does.

> **This is an unaudited Monad Testnet prototype using fictional demonstration
> data. It is not a food-safety certification system, token offering,
> charitable fundraising mechanism, or production traceability service.**

---

## Part 1 — The idea, in plain English

### The problem, in one sentence

When a jar of kimchi says "fermented 14 days, cabbage from Gangwon, lot
L-2026-014", the only thing making that true is the producer's word, and their
private database — which they can edit at any time, with nobody able to tell.

### The analogy that lands

> Think of a wax seal on a letter. The seal doesn't tell you the letter is
> *honest*. It tells you two things: **who sealed it**, and **that nobody has
> opened it since**. That is exactly what this does — for a data file about a
> batch of food.

Say this early. Every question people ask later is really "does it prove the
contents are true?", and the wax seal answers it before they ask.

### How it works, three steps

1. **Write the record.** The producer fills in the public facts about a batch —
   dates, lot number, ingredient origins. Ordinary data.
2. **Take a fingerprint.** The app converts that record into one exact sequence
   of bytes and runs it through `keccak256`, producing a 64-character
   fingerprint. Change *one character* anywhere in the record and the
   fingerprint changes completely.
3. **Publish the fingerprint.** Only the fingerprint goes onto Monad — not the
   record, not documents, no personal data. It is now timestamped and permanent.

Later, anybody with the file can recompute the fingerprint themselves and
compare. Match means unchanged. No match means it differs.

### Why it is useful

- **The producer can't quietly rewrite history.** Every correction is a new
  version; the old one stays visible forever.
- **A recall can't be buried.** It's a permanent event on a public ledger.
- **Nobody has to trust the website.** The check runs in *your* browser against
  a public blockchain. This site could vanish and the record would still verify.
- **Nothing confidential is exposed.** Only hashes go on-chain. Supplier terms,
  pricing, and test reports stay private.

### What to be honest about

Do not oversell this. Say it out loud:

> It proves an authorised person published these exact bytes at this time and
> they haven't changed. It does **not** prove the food is safe, that the
> contents are true, or that the jar in your hand is really this batch.

That honesty *is* the pitch. Anyone can put "blockchain" on a food product; very
few state precisely what it does not do.

---

## Part 2 — Before you present

### 10 minutes before

```bash
git pull
npm install
npm run build && npm start        # or just: npm run dev
```

Use the deployed URL if you have one, otherwise `http://localhost:3000`. Both
behave identically — the app reads the live Monad Testnet contract either way.

### Open these four tabs, in this order

| Tab | URL |
|---|---|
| 1 | `/` |
| 2 | `/trace` |
| 3 | `/trace/0x530be5d0882872eb58d27cab161bddeecf5448f751de0a23e4e6e003a6ec779a` |
| 4 | `/verify` |

Tab 3 is long — open it once beforehand so it is already loaded and you never
type a hash on stage.

### Projector settings

- Browser zoom **125–150%**. The interface is dark with fine mono type; it
  reads well on a laptop and poorly on a projector at 100%.
- Full screen (`F11` / `⌃⌘F`), close other windows.
- Load every tab once before you start so the chain reads are warm. The public
  RPC is rate-limited and a cold timeline scan takes a few seconds.

### Have ready

- A phone with a camera, for the QR scan.
- The contract on MonadScan in a spare tab, in case someone asks:
  <https://testnet.monadscan.com/address/0xCBC03079CcdA3ef1E8700D0c0D66384c9918524F>

---

## Part 3 — The three-minute script

Times are cumulative. Words in quotes are roughly what to say; the bullets are
what to do.

### 0:00 — 0:25 · The claim  ·  Tab 1, `/`

- Point at the headline.

> "This is a public record of what was published about a jar of kimchi. Not a
> claim that it's good — a record of what was said, and when, and by whom."

- Scroll to the footer. Point at the three boxes.

> "Registered by an authorised verifier. Cryptographically unchanged. **Not**
> independently validated for truth or food safety. That third one is on every
> single page of this site."

**Why this first:** you set the honesty frame before showing anything shiny. It
inoculates against the "so it proves the food is safe?" question.

### 0:25 — 0:50 · The index  ·  Tab 2, `/trace`

- Point at the search box.

> "Anyone can look up a batch — by its record hash, or just by its batch ID.
> No wallet, no login, no account."

- Point at the batch in **Recently registered**.

> "This is read straight from the blockchain. Product name, status, who
> registered it, when."

- Note the product name is shown.

> "It only shows the product name because the document has been loaded and its
> fingerprint re-checked. If it couldn't verify it, it says so instead of
> printing text it can't vouch for."

- Click **Batch Passport →**.

### 0:50 — 1:35 · The passport  ·  Tab 3

This is the centrepiece. Slow down here.

- Point at the top banner: **Demo data — not a commercial batch**.

> "Everything here is fictional."

- Point at the green-purple strip: **Registered · Hash verified**.

> "The published document still matches the fingerprint on the blockchain."

- Point at the warm paper panel.

> "Product detail on paper — what a shopper reads."

- Point at the dark panel on the right.

> "Verification tools in ink — hashes, the issuer's wallet, links to the block
> explorer. Two different jobs, two different surfaces."

- Scroll to the timeline.

> "Eight chain-of-custody events: ingredient received, fermentation started,
> quality check, packed, shipped, received. Each one is a separate permanent
> entry with its own transaction. Nothing here can be edited or deleted —
> a correction gets appended, it never overwrites."

- Click any **Transaction ↗** link to show it is real, then come straight back.

### 1:35 — 1:50 · The QR  ·  Tab 3, scroll to the QR panel

- Scan it with your phone. Hold the phone up.

> "Same page. On a phone. No app, no wallet, no account. This is what would be
> printed on the jar."

**If the venue wifi is bad:** don't fight it. Say "this would be printed on the
lid" and move on. It costs you five seconds; waiting costs thirty.

### 1:50 — 2:35 · Tamper detection  ·  Tab 4, `/verify`

The moment people remember. Do it deliberately.

- Click **Load demo document**.

> "This is the published file. My browser is hashing it right now — the file
> never leaves my machine."

- Point at **Verified against the Monad record**.

- Now scroll into the JSON textarea and change **one character**: find
  `"lotNumber": "L-2026-014"` and make it `L-2026-999`.

- Point at the result flipping to **MODIFIED**, in red.

> "One character. Different fingerprint. And it tells you exactly which field
> changed — lot number, was 014, now 999."

- Say this next line carefully. It matters.

> "Notice what it does *not* say. It doesn't say fraud. It says this file
> differs from the registered version. It might be an old copy, or a program
> that rewrote the file when saving. The system reports the difference; a human
> decides what it means."

- Now change it **back** to `L-2026-014`.

> "And it's verified again."

### 2:35 — 2:50 · The producer's side  ·  `/admin/batches/new`

- Open it. Point at the "Wallet not connected" notice.

> "Registering a batch needs a wallet holding a verifier role. The site never
> sees a private key — your wallet signs it."

- Point at the **canonical JSON** panel and the **record hash** beneath it.

> "Before signing anything, you see the exact bytes about to be measured, and
> the fingerprint they produce. You're never asked to trust the form."

**Do not attempt to sign on stage.** It needs a funded wallet and a network
round trip, and it's the one part that can hang in front of an audience.

### 2:50 — 3:00 · Land it

> "The blockchain proved exactly one thing: an authorised person published
> these exact bytes at this time, and they haven't changed since. Everything
> else is still trust — and every page on this site says so."

---

## Part 4 — If something goes wrong

| Problem | What to do |
|---|---|
| Timeline slow or says "may be incomplete" | Say it out loud: "the public RPC limits how much history you can query at once, so the app tells you when it couldn't scan everything rather than pretending." It's a *feature* — honest failure. |
| Passport shows "Reading Monad Testnet" | Wait 3 seconds, then reload once. Have Tab 3 pre-loaded so this never happens. |
| QR won't scan | Skip it. "This would be printed on the lid." |
| Wallet won't connect | Skip the admin page. The whole read-only demo — index, passport, verify, tamper — needs no wallet at all. |
| Someone spots `localhost` in the Metadata URI | Honest answer: "the demo record points at a local file. The document is bundled with the app so it still verifies — that field is cosmetic and it's in the README's limitations." |

**The rule:** never debug on stage. Every part of this demo except the QR and the
admin page works without a wallet or a network round trip you can see.

---

## Part 5 — Questions you will get

**"So this proves the kimchi is safe?"**
No. It proves who published the record and that it hasn't changed. Food safety
is an inspection, not a hash. The site says this on every page.

**"What stops the producer just lying in the first place?"**
Nothing. If they publish a wrong date, this faithfully records that they
published a wrong date — permanently, with a timestamp and their wallet
address. It converts a deniable private edit into an undeniable public one.

**"Why blockchain and not a normal database?"**
Because the check has to work without trusting the producer. Anyone can verify
against Monad without asking us for anything. If this site disappeared tomorrow,
every record would still be verifiable.

**"What if they change the QR code on the jar?"**
Then it points somewhere else — that's a physical packaging problem, not
something a ledger can solve. Listed under limitations: nothing links the
physical jar to the record.

**"Is this a token / can I invest?"**
No. There is no token, no payment, no fundraising. The contract has no `payable`
function at all — send it money and the transaction reverts.

**"Is it audited?"**
No. 64 contract tests and 90 application tests, no external audit. It's an
unaudited testnet prototype and the README lists the gates before it could be
anything more.

---

## Part 6 — If you get five minutes instead of three

Add these, in priority order:

1. **Reformatting proof (+30s).** On `/verify`, re-indent the JSON or reorder
   its keys — still `VERIFIED`. "The fingerprint is over *meaning*, not
   formatting. Windows line endings, different indentation, keys in a different
   order — same record, same hash."
2. **The version chain (+30s).** Explain supersession: a correction publishes a
   new version pointing back at the old one, and the old one stays readable
   forever with a link forward to the current version.
3. **What is deliberately *not* on-chain (+30s).** On `/`, the "Never on-chain"
   panel: supplier documents, personal data, pricing, private supplier terms.
   "Only fingerprints. That's what makes it publishable at all."
4. **The contract on MonadScan (+30s).** Show it's a real deployed contract with
   real transactions, not a mock.

---

## One-line summary, if you only get a sentence

> A wax seal for food records: it proves who published a batch record and that
> nobody has changed it since — and it is careful never to claim more than that.
