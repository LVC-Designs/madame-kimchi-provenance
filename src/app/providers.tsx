"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";

import { wagmiConfig } from "@/lib/wagmi";

/**
 * Client-side providers: wagmi (Monad Testnet + injected MetaMask) wrapped by
 * TanStack Query, which wagmi uses for its read hooks.
 *
 * The QueryClient is created inside `useState` so each browser session gets one
 * instance and server renders never share a cache between requests.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // On-chain records are immutable once registered, so cached reads
            // stay correct; the timeline only grows by appended attestations.
            staleTime: 30_000,
            retry: 2,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
