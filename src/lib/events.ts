import type { Hex, PublicClient } from "viem";

import { kimchiProvenanceAbi } from "./abi/kimchiProvenance.ts";
import { PROVENANCE_DEPLOY_BLOCK } from "./contract.ts";

/**
 * Reading the append-only timeline back out of contract logs.
 *
 * The contract keeps the timeline in events rather than storage, which is what
 * CLAUDE.md asks for and is far cheaper — but it means reconstructing a
 * timeline depends on the RPC serving historical logs, and the public Monad
 * Testnet endpoint caps `eth_getLogs` at a 100-block range.
 *
 * So this module adapts rather than assuming:
 *
 *   1. Try the whole range in one request. Endpoints without the cap (Alchemy,
 *      QuickNode, a self-hosted node) answer immediately and we are done.
 *   2. If the endpoint rejects the range, fall back to fixed-size windows,
 *      fetched with bounded concurrency.
 *   3. Bound the work. Monad produces roughly 216,000 blocks a day, so scanning
 *      from deployment to head is not viable indefinitely. The scan starts near
 *      the block the batch was registered in — nothing about a batch can
 *      predate its own registration — and stops after a fixed number of
 *      windows.
 *   4. Report what was actually covered. A scan that stops early returns
 *      `complete: false` and the range it managed, so the interface can say the
 *      timeline may be partial instead of presenting a truncated history as the
 *      whole story.
 *
 * Step 4 is the important one. Silently showing three of five custody events on
 * a food provenance record would be worse than showing none.
 */

/** The public endpoint's limit. Also the fallback window size. */
const WINDOW_SIZE = 100n;

/** Windows fetched at once. */
const CONCURRENCY = 5;

/**
 * The public endpoint also caps request *rate* at 25/sec, separately from the
 * 100-block range cap. Firing windows as fast as they complete trips it within
 * a second, so batches are paced to stay comfortably underneath.
 */
const MAX_REQUESTS_PER_SECOND = 18;

/** Hard ceiling on fallback windows — about 4 hours of Monad at 400ms blocks. */
const MAX_WINDOWS = 360;

/** Monad's target block time, used only to estimate a scan start. */
const BLOCK_TIME_MS = 400;

/** Blocks of slack around the estimated start, absorbing block-time drift. */
const START_MARGIN = 2_000n;

export interface ScanRange {
  fromBlock: bigint;
  toBlock: bigint;
  /** False when the scan hit `MAX_WINDOWS` before reaching `toBlock`. */
  complete: boolean;
  /** True when the endpoint served the whole range in one request. */
  singleRequest: boolean;
}

export interface TimelineEvent {
  kind: "REGISTERED" | "ATTESTATION" | "STATUS_CHANGED" | "SUPERSEDED";
  blockNumber: bigint;
  logIndex: number;
  transactionHash: Hex;
  /** Decoded arguments, shaped per `kind` by the consumer. */
  args: Record<string, unknown>;
}

export interface TimelineResult {
  events: TimelineEvent[];
  range: ScanRange;
}

/** Recognises the several ways an endpoint says "that range is too wide". */
function isRangeLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /limited to a \d+ range/i.test(message) ||
    /block range/i.test(message) ||
    /range is too large/i.test(message) ||
    /query returned more than/i.test(message) ||
    /-32614/.test(message)
  );
}

/** Distinct from the range cap: too many requests, not too wide a request. */
function isRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /requests limited to/i.test(message) ||
    /rate limit/i.test(message) ||
    /too many requests/i.test(message) ||
    /-32011/.test(message) ||
    /\b429\b/.test(message)
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Retries only rate-limit failures, backing off. Other errors surface at once. */
async function withRateLimitRetry<T>(operation: () => Promise<T>): Promise<T> {
  const attempts = 5;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRateLimitError(error) || attempt === attempts - 1) throw error;
      await sleep(250 * 2 ** attempt);
    }
  }

  throw new Error("unreachable");
}

/**
 * Estimates the block a batch was registered in, from its on-chain timestamp.
 *
 * Costs one `getBlock` and is deliberately approximate — `START_MARGIN` absorbs
 * the error, and the scan runs forward from here to the head anyway. A binary
 * search would be exact but would spend ~25 round trips to refine a bound that
 * a margin handles for one.
 */
async function estimateStartBlock(
  client: PublicClient,
  headBlock: bigint,
  registeredAtSeconds: bigint,
): Promise<bigint> {
  const head = await client.getBlock({ blockNumber: headBlock });
  const elapsedMs = (head.timestamp - registeredAtSeconds) * 1000n;
  if (elapsedMs <= 0n) return headBlock;

  const estimated = headBlock - elapsedMs / BigInt(BLOCK_TIME_MS);
  const withMargin = estimated - START_MARGIN;

  // Never scan before the contract existed.
  return withMargin < PROVENANCE_DEPLOY_BLOCK ? PROVENANCE_DEPLOY_BLOCK : withMargin;
}

async function fetchWindow(
  client: PublicClient,
  address: Hex,
  fromBlock: bigint,
  toBlock: bigint,
) {
  return client.getContractEvents({
    address,
    abi: kimchiProvenanceAbi,
    fromBlock,
    toBlock,
    strict: false,
  });
}

/**
 * Fetches every registry event in a range, adapting to the endpoint's limits.
 */
export async function fetchRegistryEvents(
  client: PublicClient,
  address: Hex,
  options: { registeredAt?: bigint } = {},
): Promise<TimelineResult> {
  const headBlock = await client.getBlockNumber();

  const startBlock =
    options.registeredAt === undefined
      ? PROVENANCE_DEPLOY_BLOCK
      : await estimateStartBlock(client, headBlock, options.registeredAt);

  // --- 1. Optimistic single request ------------------------------------
  try {
    const logs = await fetchWindow(client, address, startBlock, headBlock);
    return {
      events: toTimeline(logs),
      range: {
        fromBlock: startBlock,
        toBlock: headBlock,
        complete: true,
        singleRequest: true,
      },
    };
  } catch (error) {
    if (!isRangeLimitError(error)) throw error;
  }

  // --- 2. Windowed fallback ---------------------------------------------
  const windows: { from: bigint; to: bigint }[] = [];
  for (let from = startBlock; from <= headBlock; from += WINDOW_SIZE) {
    if (windows.length >= MAX_WINDOWS) break;
    const to = from + WINDOW_SIZE - 1n;
    windows.push({ from, to: to > headBlock ? headBlock : to });
  }

  const collected: Awaited<ReturnType<typeof fetchWindow>> = [];
  const minimumBatchMs = (CONCURRENCY / MAX_REQUESTS_PER_SECOND) * 1000;

  for (let i = 0; i < windows.length; i += CONCURRENCY) {
    const startedAt = Date.now();
    const batch = windows.slice(i, i + CONCURRENCY);

    const results = await Promise.all(
      batch.map((window) =>
        withRateLimitRetry(() => fetchWindow(client, address, window.from, window.to)),
      ),
    );
    for (const logs of results) collected.push(...logs);

    // Pace the next batch so the endpoint's per-second cap is never reached.
    const remaining = minimumBatchMs - (Date.now() - startedAt);
    if (remaining > 0 && i + CONCURRENCY < windows.length) await sleep(remaining);
  }

  const scannedTo = windows.at(-1)?.to ?? startBlock;

  return {
    events: toTimeline(collected),
    range: {
      fromBlock: startBlock,
      toBlock: scannedTo,
      complete: scannedTo >= headBlock,
      singleRequest: false,
    },
  };
}

const KIND_BY_EVENT: Record<string, TimelineEvent["kind"]> = {
  BatchRegistered: "REGISTERED",
  AttestationAdded: "ATTESTATION",
  BatchStatusChanged: "STATUS_CHANGED",
  BatchSuperseded: "SUPERSEDED",
};

function toTimeline(logs: Awaited<ReturnType<typeof fetchWindow>>): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const log of logs) {
    const kind = log.eventName === undefined ? undefined : KIND_BY_EVENT[log.eventName];
    // Role and pause events are real, but they belong to registry
    // administration rather than to any one batch's timeline.
    if (kind === undefined) continue;

    events.push({
      kind,
      blockNumber: log.blockNumber ?? 0n,
      logIndex: log.logIndex ?? 0,
      transactionHash: log.transactionHash ?? "0x",
      args: (log.args ?? {}) as Record<string, unknown>,
    });
  }

  // Chain order: block, then position within block.
  events.sort((a, b) =>
    a.blockNumber === b.blockNumber
      ? a.logIndex - b.logIndex
      : a.blockNumber < b.blockNumber
        ? -1
        : 1,
  );

  return events;
}

/**
 * The most recently registered batches, newest first.
 *
 * Scans *backward* from the chain head. "Recent" is naturally bounded that way:
 * a forward scan from deployment gets slower every day the chain advances,
 * whereas this stops as soon as enough registrations are found. It gives up at
 * the deployment block or the window ceiling, whichever comes first.
 */
export async function fetchRecentRegistrations(
  client: PublicClient,
  address: Hex,
  limit = 12,
): Promise<{ events: TimelineEvent[]; range: ScanRange }> {
  const headBlock = await client.getBlockNumber();

  // One optimistic attempt: endpoints without a range cap answer immediately.
  try {
    const logs = await withRateLimitRetry(() =>
      client.getContractEvents({
        address,
        abi: kimchiProvenanceAbi,
        eventName: "BatchRegistered",
        fromBlock: PROVENANCE_DEPLOY_BLOCK,
        toBlock: headBlock,
        strict: false,
      }),
    );

    return {
      events: toTimeline(logs).reverse().slice(0, limit),
      range: {
        fromBlock: PROVENANCE_DEPLOY_BLOCK,
        toBlock: headBlock,
        complete: true,
        singleRequest: true,
      },
    };
  } catch (error) {
    if (!isRangeLimitError(error)) throw error;
  }

  const found: TimelineEvent[] = [];
  let to = headBlock;
  let windows = 0;
  const minimumBatchMs = (CONCURRENCY / MAX_REQUESTS_PER_SECOND) * 1000;

  while (to >= PROVENANCE_DEPLOY_BLOCK && windows < MAX_WINDOWS && found.length < limit) {
    const startedAt = Date.now();

    const batch: { from: bigint; to: bigint }[] = [];
    for (let i = 0; i < CONCURRENCY && to >= PROVENANCE_DEPLOY_BLOCK; i += 1) {
      const from = to - WINDOW_SIZE + 1n;
      batch.push({ from: from < PROVENANCE_DEPLOY_BLOCK ? PROVENANCE_DEPLOY_BLOCK : from, to });
      to = from - 1n;
      windows += 1;
    }

    const results = await Promise.all(
      batch.map((window) =>
        withRateLimitRetry(() =>
          client.getContractEvents({
            address,
            abi: kimchiProvenanceAbi,
            eventName: "BatchRegistered",
            fromBlock: window.from,
            toBlock: window.to,
            strict: false,
          }),
        ),
      ),
    );

    for (const logs of results) found.push(...toTimeline(logs));

    const remaining = minimumBatchMs - (Date.now() - startedAt);
    if (remaining > 0 && found.length < limit) await sleep(remaining);
  }

  // toTimeline sorts ascending within each window; newest first overall.
  found.sort((a, b) => (a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : a.blockNumber < b.blockNumber ? 1 : -1));

  const scannedFrom = to + 1n < PROVENANCE_DEPLOY_BLOCK ? PROVENANCE_DEPLOY_BLOCK : to + 1n;

  return {
    events: found.slice(0, limit),
    range: {
      fromBlock: scannedFrom,
      toBlock: headBlock,
      complete: scannedFrom <= PROVENANCE_DEPLOY_BLOCK,
      singleRequest: false,
    },
  };
}

/** Narrows a timeline to the events that concern one batch record. */
export function eventsForRecord(
  events: TimelineEvent[],
  recordHash: string,
): TimelineEvent[] {
  const target = recordHash.toLowerCase();

  return events.filter((event) => {
    switch (event.kind) {
      case "REGISTERED":
      case "STATUS_CHANGED":
        return String(event.args.recordHash ?? "").toLowerCase() === target;
      case "ATTESTATION":
        return String(event.args.batchRecordHash ?? "").toLowerCase() === target;
      case "SUPERSEDED":
        return (
          String(event.args.supersededRecordHash ?? "").toLowerCase() === target ||
          String(event.args.newRecordHash ?? "").toLowerCase() === target
        );
    }
  });
}
