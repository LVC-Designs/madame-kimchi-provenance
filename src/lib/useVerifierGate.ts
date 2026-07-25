"use client";

import type { Address } from "viem";
import type { Connector } from "wagmi";
import {
  useAccount,
  useBalance,
  useConnect,
  useReadContract,
  useSwitchChain,
} from "wagmi";

import { PROVENANCE_ADDRESS, VERIFIER_ROLE, kimchiProvenanceAbi } from "@/lib/contract";
import { MONAD_TESTNET_CHAIN_ID } from "@/lib/monad";
import { useOpenRegistration } from "@/lib/useOpenRegistration";

/**
 * The conditions a wallet must satisfy before it can write to the registry.
 *
 * Shared by batch registration and attestation so the two cannot drift. A gate
 * enforced slightly differently on two screens is a gate that will eventually
 * let something through on one of them.
 */
export interface VerifierGate {
  /** A registry address is available. */
  configured: boolean;
  address: Address | undefined;
  isConnected: boolean;
  chainId: number | undefined;
  onMonad: boolean;
  /** `undefined` until the role read resolves. */
  hasVerifierRole: boolean | undefined;
  roleLoading: boolean;
  isPaused: boolean | undefined;
  /** Wallet holds no MON, so it cannot pay gas. */
  noFunds: boolean;
  /** Every gate passed; a write may be attempted. */
  ready: boolean;
  /** Every wallet wagmi can see: the configured injected one plus EIP-6963 discoveries. */
  connectors: readonly Connector[];
  /** Connect using a specific wallet, or the best guess when omitted. */
  connect: (connector?: Connector) => void;
  isConnecting: boolean;
  /** Why the last connection attempt failed. Surfaced, never swallowed. */
  connectError: string | null;
  /** No injected provider at all — usually means no wallet extension installed. */
  noWalletDetected: boolean;
  /** This registry lets anyone write; "authorized verifier" would be a lie here. */
  openRegistration: boolean;
  switchToMonad: () => void;
  isSwitching: boolean;
}

export function useVerifierGate(): VerifierGate {
  const { address, isConnected, chainId } = useAccount();
  const {
    connect,
    connectors,
    isPending: isConnecting,
    error: rawConnectError,
  } = useConnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const openRegistration = useOpenRegistration();

  const configured = PROVENANCE_ADDRESS !== null;
  const onMonad = chainId === MONAD_TESTNET_CHAIN_ID;
  const readsEnabled = configured && isConnected && onMonad;

  const { data: hasVerifierRole, isLoading: roleLoading } = useReadContract({
    address: PROVENANCE_ADDRESS ?? undefined,
    abi: kimchiProvenanceAbi,
    functionName: "hasRole",
    args: address === undefined ? undefined : [VERIFIER_ROLE, address],
    query: { enabled: readsEnabled && address !== undefined },
  });

  const { data: isPaused } = useReadContract({
    address: PROVENANCE_ADDRESS ?? undefined,
    abi: kimchiProvenanceAbi,
    functionName: "paused",
    query: { enabled: readsEnabled },
  });

  const { data: balance } = useBalance({
    address,
    query: { enabled: readsEnabled && address !== undefined },
  });

  const noFunds = balance !== undefined && balance.value === 0n;

  return {
    configured,
    address,
    isConnected,
    chainId,
    onMonad,
    hasVerifierRole: hasVerifierRole as boolean | undefined,
    roleLoading,
    isPaused: isPaused as boolean | undefined,
    noFunds,
    ready:
      configured &&
      isConnected &&
      onMonad &&
      hasVerifierRole === true &&
      isPaused === false &&
      !noFunds,
    connectors,
    noWalletDetected: connectors.length === 0,
    openRegistration,
    connect: (chosen?: Connector) => {
      // Prefer an explicit choice, then anything calling itself MetaMask, then
      // any injected provider. Falling through to connectors[0] rather than
      // giving up silently is the point: a dead button reports nothing.
      const connector =
        chosen ??
        connectors.find((c) => c.name.toLowerCase().includes("metamask")) ??
        connectors.find((c) => c.type === "injected") ??
        connectors[0];

      if (connector === undefined) return;
      connect({ connector });
    },
    isConnecting,
    connectError:
      rawConnectError === null
        ? null
        : ((rawConnectError as { shortMessage?: string }).shortMessage ??
          rawConnectError.message),
    switchToMonad: () => switchChain({ chainId: MONAD_TESTNET_CHAIN_ID }),
    isSwitching,
  };
}
