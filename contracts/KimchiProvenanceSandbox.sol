// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {KimchiProvenance} from "./KimchiProvenance.sol";

/// @title  Madame Kimchi — Batch Provenance, open sandbox
/// @notice A teaching instance of the registry that anyone may write to.
///
/// @dev    Identical to {KimchiProvenance} in every respect except who is
///         allowed to write. Every integrity property is preserved:
///
///           - records are append-only and never overwritten;
///           - duplicate record and attestation hashes are rejected;
///           - corrections supersede and leave the original readable;
///           - RECALLED and SUPERSEDED remain terminal;
///           - the same events are emitted, so the same interface reads it.
///
///         What is deliberately absent is the answer to "who published this".
///         On the production registry that answer means something, because
///         `VERIFIER_ROLE` is granted deliberately. Here it means only "some
///         wallet", and the interface must say so — which is what
///         `OPEN_REGISTRATION` is for.
///
///         Implemented by overriding `hasRole` rather than by copying the
///         contract. `onlyRole` routes through `_checkRole`, which routes
///         through `hasRole`, so a single override opens every write path and
///         the production contract's source stays byte-identical to the
///         bytecode already deployed. A copy would have drifted.
///
///         Not for production, and not a demonstration of the access-control
///         model. It exists so people can register a record of their own
///         without an administrator granting them a role first.
contract KimchiProvenanceSandbox is KimchiProvenance {
    /// @notice Declares on-chain that anyone may write here.
    /// @dev    The interface reads this to replace "authorized verifier" with
    ///         an honest description. A registry that lets anyone write must
    ///         not present its records as verifier-attested.
    bool public constant OPEN_REGISTRATION = true;

    /// @param admin Retains DEFAULT_ADMIN_ROLE and PAUSER_ROLE, so an abusive
    ///        sandbox can still be paused. Only the verifier gate is removed.
    constructor(address admin) KimchiProvenance(admin) {}

    /// @notice Reports every account as holding `VERIFIER_ROLE`.
    /// @dev Admin and pauser are unchanged: opening registration must not also
    ///      hand out the ability to pause the registry or grant roles on it.
    /// @param role The role being checked.
    /// @param account The account being checked.
    /// @return Whether `account` holds `role` on this registry.
    function hasRole(
        bytes32 role,
        address account
    ) public view override returns (bool) {
        if (role == VERIFIER_ROLE) return true;
        return super.hasRole(role, account);
    }
}
