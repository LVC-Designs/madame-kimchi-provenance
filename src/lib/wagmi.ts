import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";

import { monadTestnet, MONAD_TESTNET_RPC_URL } from "@/lib/monad";

/**
 * Wallet configuration for the Batch Passport prototype.
 *
 * Monad Testnet is the only chain. There is no WalletConnect project id, no
 * custodial signer, and no private key anywhere in the browser bundle — the
 * wallet holds the key and signs `registerBatch` and `addAttestation` itself.
 *
 * The connector is deliberately untargeted. `injected({ target: "metaMask" })`
 * matches only a provider that sets `isMetaMask` on `window.ethereum`, which
 * fails whenever another extension has claimed that object first, and modern
 * MetaMask announces itself over EIP-6963 rather than by that flag alone.
 * A plain `injected()` matches whatever is there, and wagmi's EIP-6963
 * discovery (on by default) surfaces each installed wallet as its own
 * connector, so the interface can name them and let the operator pick.
 */
export const wagmiConfig = createConfig({
  chains: [monadTestnet],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [monadTestnet.id]: http(MONAD_TESTNET_RPC_URL),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
