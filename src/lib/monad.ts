import { defineChain } from "viem";

/**
 * Monad Testnet definition and explorer helpers.
 *
 * This is the only chain the application talks to. viem ships a `monadTestnet`
 * chain, but it points at a different explorer, so the chain is defined here to
 * keep every explorer link on the explorer named in the project brief.
 */

export const MONAD_TESTNET_CHAIN_ID = 10143 as const;

export const MONAD_TESTNET_DEFAULT_RPC_URL = "https://testnet-rpc.monad.xyz";

export const MONAD_TESTNET_EXPLORER_URL = "https://testnet.monadscan.com";

/**
 * RPC endpoint used by the browser. Public by design — it contains no secret.
 * `NEXT_PUBLIC_MONAD_RPC_URL` is inlined at build time by Next.js.
 */
export const MONAD_TESTNET_RPC_URL =
  process.env.NEXT_PUBLIC_MONAD_RPC_URL?.trim() || MONAD_TESTNET_DEFAULT_RPC_URL;

export const monadTestnet = defineChain({
  id: MONAD_TESTNET_CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: {
    name: "MON",
    symbol: "MON",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [MONAD_TESTNET_RPC_URL] },
  },
  blockExplorers: {
    default: {
      name: "MonadScan",
      url: MONAD_TESTNET_EXPLORER_URL,
    },
  },
  contracts: {
    // Lets viem and wagmi fold batched reads into a single RPC call. This
    // endpoint rate-limits and caps log ranges, so collapsing N reads into one
    // request is worth more here than it would be on a permissive node.
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
      blockCreated: 251449,
    },
  },
  testnet: true,
});

/** Explorer link for a transaction hash. */
export function explorerTxUrl(txHash: string): string {
  return `${MONAD_TESTNET_EXPLORER_URL}/tx/${txHash}`;
}

/** Explorer link for an address, used for verifier wallets and the contract. */
export function explorerAddressUrl(address: string): string {
  return `${MONAD_TESTNET_EXPLORER_URL}/address/${address}`;
}

/** Explorer link for a block. */
export function explorerBlockUrl(blockNumber: bigint | number): string {
  return `${MONAD_TESTNET_EXPLORER_URL}/block/${blockNumber.toString()}`;
}
