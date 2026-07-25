import "dotenv/config";

import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

/**
 * Madame Kimchi — Batch Provenance Protocol
 *
 * Monad Testnet only. There is no mainnet network defined here, and adding one
 * is out of scope until the legal and commercial validation gates are met.
 *
 * Secrets are read through `configVariable`, which resolves from the Hardhat
 * keystore or the process environment at the moment a network connection is
 * opened. The value is never interpolated into the config object, so a private
 * key can never be printed by `hardhat config show` or a config dump.
 */
export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],

  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          evmVersion: "prague",
        },
      },
      production: {
        version: "0.8.28",
        settings: {
          evmVersion: "prague",
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },

  networks: {
    // Local in-process chain used by the contract test suite.
    hardhat: {
      type: "edr-simulated",
      chainType: "l1",
    },

    // Monad Testnet — chain 10143, native currency MON.
    monadTestnet: {
      type: "http",
      chainType: "l1",
      chainId: 10143,
      url: configVariable("MONAD_TESTNET_RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")],
    },
  },
});
