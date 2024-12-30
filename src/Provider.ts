import { JsonRpcProvider } from '@ethersproject/providers'
import { EntryPoint__factory } from '@account-abstraction/contracts'
import { ClientConfig } from './ClientConfig'
import { SimpleAccountAPI } from './SimpleAccountAPI'
import { ERC4337EthersProvider } from './ERC4337EthersProvider'
import { HttpRpcClient } from './HttpRpcClient'
import { Signer } from '@ethersproject/abstract-signer'
import { Contract } from '@ethersproject/contracts'
import Debug from 'debug'

const debug = Debug('aa.wrapProvider')

// Minimal ABI for FactoryManager (only including the function we need)
const FactoryManagerABI = [
  {
    "inputs": [],
    "name": "getFactoryAddress",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
]

/**
 * Wrap an existing provider to tunnel requests through Account Abstraction.
 * @param originalProvider The normal provider
 * @param config See ClientConfig for more info
 * @param originalSigner Use this signer as the owner of this wallet. By default, use the provider's signer.
 */
export async function wrapProvider (
  originalProvider: JsonRpcProvider,
  config: ClientConfig,
  originalSigner: Signer = originalProvider.getSigner()
): Promise<ERC4337EthersProvider> {
  // Connect to EntryPoint contract
  const entryPoint = EntryPoint__factory.connect(config.entryPointAddress, originalProvider)

  // Check if factoryAddress is provided, if not, try to get it from FactoryManager
  let factoryAddress = config.factoryAddress
  if (!factoryAddress) {
    if (!config.factoryManagerAddress) {
      throw new Error('Either factoryAddress or factoryManagerAddress must be provided in the config.')
    }

    // Connect to the FactoryManager contract to get the factoryAddress
    const factoryManager = new Contract(config.factoryManagerAddress, FactoryManagerABI, originalProvider)
    factoryAddress = await factoryManager.getFactoryAddress()

    if (!factoryAddress) {
      throw new Error('FactoryManager did not return a valid factoryAddress.')
    }
  }

  const chainId = await originalProvider.getNetwork().then(net => net.chainId)
  const httpRpcClient = new HttpRpcClient(config.bundlerUrl, config.entryPointAddress, chainId)

  // Initialize SimpleAccountAPI with the resolved factoryAddress
  const smartAccountAPI = new SimpleAccountAPI({
    provider: originalProvider,
    entryPointAddress: entryPoint.address,
    owner: originalSigner,
    factoryAddress,  // Use resolved factoryAddress
    paymasterAPI: config.paymasterAPI,
    httpRpcClient    // Add httpRpcClient
  })

  debug('config=', config)

  // Return the initialized ERC4337EthersProvider
  return await new ERC4337EthersProvider(
    chainId,
    config,
    originalSigner,
    originalProvider,
    httpRpcClient,
    entryPoint,
    smartAccountAPI
  ).init()
}
