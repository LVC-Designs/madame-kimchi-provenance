"use client";

import { useReadContract } from "wagmi";

import { PROVENANCE_ADDRESS } from "@/lib/contract";

/**
 * Whether the configured registry lets anyone write to it.
 *
 * Read from the chain rather than from configuration, so the interface cannot
 * be pointed at an open registry while still describing its records as
 * verifier-attested. A registry that anyone can write to must not present its
 * records as though a granted role stood behind them.
 *
 * `OPEN_REGISTRATION` exists only on the sandbox contract. On the production
 * registry the call reverts, which is exactly the signal we want, so the
 * failure is treated as `false` rather than surfaced as an error.
 */
export function useOpenRegistration(): boolean {
  const { data } = useReadContract({
    address: PROVENANCE_ADDRESS ?? undefined,
    // Declared inline: the production ABI has no such function, and adding it
    // there would imply the production contract answers this.
    abi: [
      {
        type: "function",
        name: "OPEN_REGISTRATION",
        stateMutability: "view",
        inputs: [],
        outputs: [{ type: "bool" }],
      },
    ] as const,
    functionName: "OPEN_REGISTRATION",
    query: {
      enabled: PROVENANCE_ADDRESS !== null,
      retry: false,
      staleTime: Infinity,
    },
  });

  return data === true;
}
