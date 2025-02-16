import { BigNumber, ContractFactory, ethers } from 'ethers';
import { ERC4337EthersProvider } from './ERC4337EthersProvider';
import { ContractDeployer } from './ContractDeployer';
import { DeploymentInput } from './types/deployment';

/**
 * Create a ContractDeployer instance from an AA provider
 */
export function createContractDeployer(
  provider: ERC4337EthersProvider,
  deployContractAddress: string
): ContractDeployer {
  return new ContractDeployer(
    deployContractAddress,
    provider,
    provider.getSigner()
  );
}

/**
 * Deploy a contract using either ContractFactory or raw bytecode
 * @param provider The AA provider to use for deployment
 * @param input The deployment input (bytecode or ContractFactory)
 * @param salt Optional salt for deterministic address (defaults to a standard value)
 * @param deployContractAddress Optional address of the deployment contract (if not provided, uses the one from provider config)
 * @param options Additional options like gasLimit
 * @returns The transaction hash of the deployment
 * @throws {Error} If deployContractAddress is not provided and not available in provider config
 */
export async function deployContract(
  provider: ERC4337EthersProvider,
  input: DeploymentInput,
  salt?: string,
  deployContractAddress?: string,
  options?: { gasLimit?: BigNumber }
): Promise<string> {
  const address = deployContractAddress ?? provider.config.deployContractAddress;
  if (!address) {
    throw new Error('deployContractAddress must be provided either directly or in provider config');
  }

  const deployer = new ContractDeployer(
    address,
    provider,
    provider.getSigner()
  );

  const result = await deployer.deploy(input, salt, options);
  return result.transactionHash;
}

/**
 * Predict the address where a contract will be deployed
 * @param provider The AA provider to use for prediction
 * @param input The deployment input (bytecode or ContractFactory)
 * @param salt Optional salt for deterministic address (defaults to a standard value)
 * @param deployContractAddress Optional address of the deployment contract (if not provided, uses the one from provider config)
 * @returns The predicted address where the contract will be deployed
 * @throws {Error} If deployContractAddress is not provided and not available in provider config
 */
export async function predictContractAddress(
  provider: ERC4337EthersProvider,
  input: DeploymentInput,
  salt?: string,
  deployContractAddress?: string
): Promise<string> {
  const address = deployContractAddress ?? provider.config.deployContractAddress;
  if (!address) {
    throw new Error('deployContractAddress must be provided either directly or in provider config');
  }

  const deployer = new ContractDeployer(
    address,
    provider,
    provider.getSigner()
  );

  return deployer.predictAddress(input, salt);
}

/**
 * Estimate gas for contract deployment
 * @param provider The AA provider to use for estimation
 * @param input The deployment input (bytecode or ContractFactory)
 * @param salt Optional salt for deterministic address (defaults to a standard value)
 * @param deployContractAddress Optional address of the deployment contract (if not provided, uses the one from provider config)
 * @returns Estimated gas amount including AA overhead
 * @throws {Error} If deployContractAddress is not provided and not available in provider config
 */
export async function estimateDeploymentGas(
  provider: ERC4337EthersProvider,
  input: DeploymentInput,
  salt?: string,
  deployContractAddress?: string
): Promise<BigNumber> {
  const address = deployContractAddress ?? provider.config.deployContractAddress;
  if (!address) {
    throw new Error('deployContractAddress must be provided either directly or in provider config');
  }

  const deployer = new ContractDeployer(
    address,
    provider,
    provider.getSigner()
  );

  return deployer.estimateGas(input, salt);
}