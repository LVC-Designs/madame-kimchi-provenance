import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Deploys the open sandbox registry.
 *
 * A second, separate instance. The production registry at the address in
 * `src/lib/deployment.ts` is untouched and stays role-gated — this exists only
 * so people can register a record of their own without an administrator
 * granting them a role first.
 *
 * The deployer keeps admin and pauser here. Opening registration must not also
 * hand out the ability to pause the registry or grant roles on it.
 */
export default buildModule("KimchiProvenanceSandboxModule", (m) => {
  const admin = m.getAccount(0);

  const sandbox = m.contract("KimchiProvenanceSandbox", [admin]);

  return { sandbox };
});
