import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Deploys the Madame Kimchi batch provenance registry.
 *
 * The deployer becomes admin, verifier, and pauser. That happens inside the
 * constructor rather than through follow-up `grantRole` transactions, so the
 * contract is never briefly live with no administrator, and the deployment is a
 * single transaction with nothing to half-apply.
 *
 * Handing administration to a multisig later needs no redeployment: the new
 * admin calls are `grantRole(DEFAULT_ADMIN_ROLE, multisig)` followed by
 * `renounceRole(DEFAULT_ADMIN_ROLE, deployer)`, in that order.
 *
 * There is nothing secret in this module. The deployer address is derived from
 * the configured account at signing time and is public once the transaction
 * lands; the key itself is resolved by Hardhat's `configVariable` and never
 * enters module state.
 */
export default buildModule("KimchiProvenanceModule", (m) => {
  const admin = m.getAccount(0);

  const kimchiProvenance = m.contract("KimchiProvenance", [admin]);

  return { kimchiProvenance };
});
