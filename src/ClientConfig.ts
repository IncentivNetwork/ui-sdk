import { PaymasterAPI } from './PaymasterAPI'

/**
 * Configuration params for wrapProvider
 */
export interface ClientConfig {
  /**
   * The entry point to use
   */
  entryPointAddress: string

  /**
   * URL to the bundler
   */
  bundlerUrl: string

  /**
   * If set, use this pre-deployed wallet.
   * (If not set, use getSigner().getAddress() to query the "counterfactual" address of the wallet.
   *  You may need to fund this address so the wallet can pay for its own creation)
   */
  walletAddress?: string

  /**
   * If set, call just before signing.
   */
  paymasterAPI?: PaymasterAPI

  /**
   * The address of the factory contract that will deploy account contracts.
   * If this is provided, it will be used directly.
   * If not provided, the factory address will be fetched from the factory manager contract.
   */
  factoryAddress?: string

  /**
   * The address of the factory manager contract, which provides the factoryAddress.
   * This is used to dynamically fetch the factory address if the factoryAddress is not explicitly provided.
   * If both factoryAddress and factoryManagerAddress are not provided, an error will be thrown.
   */
  factoryManagerAddress?: string

  /**
   * The address of the CREATE2 deployer contract used for deterministic contract deployments.
   * This contract provides low-level deployment functionality through Account Abstraction.
   * Can be set globally here or overridden per deployment operation.
   * If not provided here, must be specified in individual deployment calls.
   */
  deployContractAddress?: string
}
