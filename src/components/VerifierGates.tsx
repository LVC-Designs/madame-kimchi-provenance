"use client";

import { Button } from "@/components/Button";
import { MonoValue } from "@/components/MonoValue";
import { Notice } from "@/components/Notice";
import { MONAD_TESTNET_CHAIN_ID } from "@/lib/monad";
import type { VerifierGate } from "@/lib/useVerifierGate";

/**
 * Renders the wallet gates in the order a verifier actually hits them, so the
 * screen always names the single next thing to fix rather than a wall of
 * everything that is not yet true.
 */
export function VerifierGates({ gate }: { gate: VerifierGate }) {
  if (!gate.configured) {
    return (
      <Notice tone="alert" title="Registry not configured">
        <p>
          No contract address is available. Deploy with{" "}
          <code className="font-mono">npm run chain:deploy</code>, then set{" "}
          <code className="font-mono">NEXT_PUBLIC_PROVENANCE_CONTRACT</code> in{" "}
          <code className="font-mono">.env.local</code>.
        </p>
      </Notice>
    );
  }

  if (!gate.isConnected) {
    /*
      Wallets announced over EIP-6963 carry an `rdns` and a real name, so they
      are what a person recognises. The bare `injected()` connector is always
      present whether or not a wallet exists, which is why its absence cannot be
      used to detect "no wallet" — only a failed connection can. Show the named
      wallets when there are any, and fall back to the generic one relabelled.
    */
    const announced = gate.connectors.filter((c) => c.rdns !== undefined);
    const wallets = announced.length > 0 ? announced : gate.connectors;
    const single = wallets.length === 1;
    const label = (name: string) => (name === "Injected" ? "Browser wallet" : name);

    // wagmi throws ProviderNotFoundError when nothing is installed.
    const providerMissing =
      gate.connectError !== null && /provider|not found|no.*wallet/i.test(gate.connectError);

    if (providerMissing) {
      return (
        <Notice tone="alert" title="No wallet found">
          <p className="mb-2">
            This browser exposed no wallet to connect to. Install{" "}
            <a
              href="https://metamask.io/download/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-monad-300 underline"
            >
              MetaMask
            </a>{" "}
            and reload. If it is already installed, check that it is enabled for
            this site and that you are not in a private window.
          </p>
          <p className="text-ink-400">
            Reading batch records needs no wallet — only registering and
            attesting do.
          </p>
        </Notice>
      );
    }

    return (
      <Notice
        tone={gate.connectError === null ? "info" : "alert"}
        title={gate.connectError === null ? "Wallet not connected" : "Could not connect"}
        action={
          single ? (
            <Button
              tone="primary"
              disabled={gate.isConnecting}
              onClick={() => gate.connect()}
            >
              {gate.isConnecting ? "Connecting…" : `Connect ${label(wallets[0].name)}`}
            </Button>
          ) : undefined
        }
      >
        {gate.connectError !== null && (
          <p className="text-alert-200 mb-2">{gate.connectError}</p>
        )}

        <p className="mb-2">
          Writing to the registry is signed by your wallet. This site never sees
          or holds a private key.
        </p>

        {!single && (
          <div className="mt-3 flex flex-wrap gap-2">
            {wallets.map((wallet) => (
              <Button
                key={wallet.uid}
                tone="primary"
                disabled={gate.isConnecting}
                onClick={() => gate.connect(wallet)}
              >
                {gate.isConnecting ? "Connecting…" : label(wallet.name)}
              </Button>
            ))}
          </div>
        )}
      </Notice>
    );
  }

  if (!gate.onMonad) {
    return (
      <Notice
        tone="alert"
        title="Wrong network"
        action={
          <Button tone="crypto" disabled={gate.isSwitching} onClick={gate.switchToMonad}>
            {gate.isSwitching ? "Switching…" : "Switch to Monad Testnet"}
          </Button>
        }
      >
        Your wallet is on chain {gate.chainId ?? "unknown"}. This registry lives on
        Monad Testnet ({MONAD_TESTNET_CHAIN_ID}).
      </Notice>
    );
  }

  if (gate.isPaused === true) {
    return (
      <Notice tone="alert" title="Registry paused">
        Nothing can be written while the contract is paused. A wallet holding
        PAUSER_ROLE must resume it.
      </Notice>
    );
  }

  if (!gate.roleLoading && gate.hasVerifierRole === false) {
    return (
      <Notice tone="alert" title="Not an authorized verifier">
        <p>
          <MonoValue tone="alert">{gate.address}</MonoValue> does not hold
          VERIFIER_ROLE. An administrator must grant it before this wallet can
          write to the registry.
        </p>
      </Notice>
    );
  }

  if (gate.noFunds) {
    return (
      <Notice tone="alert" title="No testnet MON">
        This wallet holds 0 MON and cannot pay gas. Fund it from a Monad Testnet
        faucet.
      </Notice>
    );
  }

  /*
    On an open registry every account reports as a verifier, so saying
    "authorized verifier" here would dress up a permissionless write as a
    vouched-for one. Name what this actually is instead.
  */
  if (gate.openRegistration) {
    return (
      <Notice tone="info" title="Open sandbox — anyone can register">
        <p className="mb-2">
          This registry accepts writes from any wallet. Records are still
          append-only, still timestamped, and still tamper-evident — but{" "}
          <strong>no role was granted to anyone</strong>, so a record here shows
          only that some wallet published it, not that an authorised verifier
          did.
        </p>
        <MonoValue tone="muted">{gate.address}</MonoValue>
      </Notice>
    );
  }

  if (gate.hasVerifierRole === true) {
    return (
      <Notice tone="crypto" title="Authorized verifier">
        <MonoValue tone="crypto">{gate.address}</MonoValue> holds VERIFIER_ROLE on
        this registry.
      </Notice>
    );
  }

  return <Notice tone="info" title="Checking authorization" />;
}
