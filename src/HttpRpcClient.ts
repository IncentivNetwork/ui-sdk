import { JsonRpcProvider } from '@ethersproject/providers'
import { ethers } from 'ethers'
import { resolveProperties } from 'ethers/lib/utils'
import { UserOperationStruct } from '@account-abstraction/contracts'
import Debug from 'debug'
import { deepHexlify } from '@account-abstraction/utils'

const debug = Debug('aa.rpc')

export class HttpRpcClient {
  private readonly userOpJsonRpcProvider: JsonRpcProvider

  initializing: Promise<void>

  constructor (
    readonly bundlerUrl: string,
    readonly entryPointAddress: string,
    readonly chainId: number
  ) {
    this.userOpJsonRpcProvider = new ethers.providers.JsonRpcProvider(this.bundlerUrl, {
      name: 'Connected bundler network',
      chainId
    })
    this.initializing = this.validateChainId()
  }

  async validateChainId (): Promise<void> {
    // validate chainId is in sync with expected chainid
    const chain = await this.userOpJsonRpcProvider.send('eth_chainId', [])
    const bundlerChain = parseInt(chain)
    if (bundlerChain !== this.chainId) {
      throw new Error(`bundler ${this.bundlerUrl} is on chainId ${bundlerChain}, but provider is on chainId ${this.chainId}`)
    }
  }

  /**
   * send a UserOperation to the bundler
   * @param userOp1
   * @return userOpHash the id of this operation, for getUserOperationTransaction
   */
  async sendUserOpToBundler (userOp1: UserOperationStruct): Promise<string> {
    await this.initializing
    const hexifiedUserOp = deepHexlify(await resolveProperties(userOp1))
    const jsonRequestData: [UserOperationStruct, string] = [hexifiedUserOp, this.entryPointAddress]
    await this.printUserOperation('eth_sendUserOperation', jsonRequestData)
    return await this.userOpJsonRpcProvider
      .send('eth_sendUserOperation', [hexifiedUserOp, this.entryPointAddress])
  }

  /**
   * estimate gas requirements for UserOperation
   * @todo change verificationGas to verificationGasLimit when the tests in the bundler are changed
   * @param userOp1
   * @returns latest gas suggestions made by the bundler.
   */
  async estimateUserOpGas(userOp1: Partial<UserOperationStruct>): Promise<{
    callGasLimit: number
    preVerificationGas: number
    verificationGas: number
    maxFeePerGas: number
    maxPriorityFeePerGas: number
    success: boolean
    error?: string
  }> {
    try {
      await this.initializing
      const hexifiedUserOp = deepHexlify(await resolveProperties(userOp1))

      debug('Sending estimation request: %o', {
        sender: hexifiedUserOp.sender,
        nonce: hexifiedUserOp.nonce,
        initCode: hexifiedUserOp.initCode?.length > 2 ? 'present' : 'none',
        callData: hexifiedUserOp.callData?.length > 2 ? 'present' : 'none'
      })

      const result = await this.userOpJsonRpcProvider
        .send('eth_estimateUserOperationGas', [hexifiedUserOp, this.entryPointAddress])
        .catch(error => {
          debug('Estimation failed: %s', error instanceof Error ? error.message : 'Unknown error')
          throw error
        })

      debug('Estimation response: %o', result)
      return {
        ...result,
        success: true
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      debug('Estimation error: %s', errorMessage)
      return {
        callGasLimit: 0,
        preVerificationGas: 0,
        verificationGas: 0,
        maxFeePerGas: 0,
        maxPriorityFeePerGas: 0,
        error: errorMessage,
        success: false
      }
    }
  }

  private async printUserOperation (method: string, [userOp1, entryPointAddress]: [UserOperationStruct, string]): Promise<void> {
    const userOp = await resolveProperties(userOp1)
    debug('sending', method, {
      ...userOp
      // initCode: (userOp.initCode ?? '').length,
      // callData: (userOp.callData ?? '').length
    }, entryPointAddress)
  }
}
