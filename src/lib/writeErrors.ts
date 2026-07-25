import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
} from "viem";

/**
 * Digs the JSON-RPC / EIP-1193 error code out of a nested error chain.
 *
 * Wallets return these codes with terse standard text — "Requested resource
 * not available" for -32002 tells a user nothing about the fact that they have
 * a MetaMask popup waiting behind the browser window.
 */
function rpcCode(error: unknown): number | null {
  let current: unknown = error;

  for (let depth = 0; depth < 10 && current !== null && current !== undefined; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "number") return code;
    current = (current as { cause?: unknown }).cause;
  }

  return null;
}

/**
 * Turns a wallet or RPC failure into something a verifier can act on.
 *
 * Every branch corresponds to a condition the registry can actually produce:
 * its own custom errors, a declined signature, an unfunded account. The
 * fallback keeps the raw message rather than inventing a friendlier one,
 * because a confidently wrong explanation costs more than an unfamiliar one.
 */
export type FailureKind =
  | "rejected"
  | "unauthorized"
  | "paused"
  | "duplicate"
  | "not-found"
  | "insufficient-mon"
  | "rpc";

export interface Failure {
  kind: FailureKind;
  title: string;
  detail: string;
}

export function classifyWriteError(error: unknown): Failure {
  if (!(error instanceof BaseError)) {
    return {
      kind: "rpc",
      title: "Unexpected error",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  if (error.walk((e) => e instanceof UserRejectedRequestError) !== null) {
    return {
      kind: "rejected",
      title: "Signature declined",
      detail:
        "The transaction was rejected in your wallet. Nothing was sent and nothing was recorded.",
    };
  }

  const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError);
  if (reverted instanceof ContractFunctionRevertedError) {
    switch (reverted.data?.errorName) {
      case "AccessControlUnauthorizedAccount":
        return {
          kind: "unauthorized",
          title: "Not an authorized verifier",
          detail:
            "This wallet does not hold VERIFIER_ROLE on the registry. An administrator must grant it first.",
        };
      case "EnforcedPause":
        return {
          kind: "paused",
          title: "Registry paused",
          detail:
            "The registry is paused, so nothing can be written. A pauser must resume it first.",
        };
      case "BatchAlreadyRegistered":
        return {
          kind: "duplicate",
          title: "Record already registered",
          detail:
            "This exact record hash is already on-chain. Records are never overwritten. Change a field, or re-stamp the generation time, to publish a distinct record.",
        };
      case "AttestationAlreadyRecorded":
        return {
          kind: "duplicate",
          title: "Attestation already recorded",
          detail:
            "This exact attestation document is already on the timeline. Attestations are append-only and never duplicated. Change a field, or re-stamp the time, to record a distinct event.",
        };
      case "BatchNotFound":
        return {
          kind: "not-found",
          title: "No such batch record",
          detail:
            "The registry holds no record for this hash, so nothing can be appended to it.",
        };
      default:
        return {
          kind: "rpc",
          title: reverted.data?.errorName ?? "Transaction reverted",
          detail: reverted.shortMessage,
        };
    }
  }

  if (/insufficient funds|exceeds the balance/i.test(error.message)) {
    return {
      kind: "insufficient-mon",
      title: "Not enough MON",
      detail:
        "This wallet cannot cover the gas for this transaction. Fund it with testnet MON and try again.",
    };
  }

  // Wallet-level EIP-1193 / JSON-RPC codes, checked before the text heuristics
  // below because their standard messages are uninformative.
  switch (rpcCode(error)) {
    case -32002:
      return {
        kind: "rpc",
        title: "Wallet request already pending",
        detail:
          "Your wallet thinks a request is still open. If you cannot see one, its queue is stuck — a known MetaMask behaviour after a popup is closed without approving or rejecting. In order: close every other tab of this site, then lock and unlock MetaMask from its account menu. If it persists, use MetaMask → Settings → Advanced → Clear activity tab data, or disable and re-enable the extension.",
      };
    case 4100:
      return {
        kind: "unauthorized",
        title: "Account not authorized for this site",
        detail:
          "Your wallet has not granted this site permission to use this account. Open MetaMask, connect this account to this site, then try again. Permissions are per-site, so a newly deployed URL needs connecting again.",
      };
    case 4902:
      return {
        kind: "rpc",
        title: "Monad Testnet not in your wallet",
        detail:
          "Your wallet does not know this network. Use the Switch to Monad Testnet button, which will offer to add it.",
      };
    case 4900:
    case 4901:
      return {
        kind: "rpc",
        title: "Wallet disconnected",
        detail: "Your wallet is not connected to a network. Reconnect it and try again.",
      };
    case -32601:
    case 4200:
      return {
        kind: "rpc",
        title: "Method not supported",
        detail: `Your wallet or its configured RPC rejected this call as unsupported. Check that the Monad Testnet entry in your wallet uses a working RPC URL. ${error.shortMessage}`,
      };
    default:
      break;
  }

  if (/rate limit|requests limited to|-32011|\b429\b/i.test(error.message)) {
    return {
      kind: "rpc",
      title: "RPC rate limit",
      detail:
        "The public Monad endpoint is rate-limiting this browser. Wait a few seconds and try again, or point NEXT_PUBLIC_MONAD_RPC_URL at your own endpoint.",
    };
  }

  /*
    A gas-estimation failure usually means the call would revert, but the
    wallet has stripped the revert data so nothing more specific can be
    decoded. Say what it probably is rather than blaming the network.
  */
  if (/gas|estimat/i.test(error.message)) {
    return {
      kind: "rpc",
      title: "Transaction would fail",
      detail: `The wallet could not estimate gas, which usually means the call would revert. ${error.shortMessage}`,
    };
  }

  // Keep the raw text: a confidently wrong explanation costs more than an
  // unfamiliar one, and this is what gets pasted into a bug report.
  return {
    kind: "rpc",
    title: error.name === "BaseError" ? "Request failed" : error.name,
    detail: error.shortMessage || error.message,
  };
}
