import { Deferrable, defineReadOnly } from '@ethersproject/properties'
import { Provider, TransactionRequest, TransactionResponse } from '@ethersproject/providers'
import { Signer } from '@ethersproject/abstract-signer'

import { BigNumber, BigNumberish, Bytes } from 'ethers'
import { ERC4337EthersProvider } from './ERC4337EthersProvider'
import { ClientConfig } from './ClientConfig'
import { HttpRpcClient } from './HttpRpcClient'
import { BaseAccountAPI } from './BaseAccountAPI'
import { UserOperation } from './utils/ERC4337Utils'
import { getDummySignature } from './calcPreVerificationGas'

export interface BatchTransactionRequest {
  targets: string[]
  datas: string[]
  values: BigNumberish[]
  gasLimit?: BigNumberish
  maxFeePerGas?: BigNumberish
  maxPriorityFeePerGas?: BigNumberish
}

export class ERC4337EthersSigner extends Signer {
  // TODO: we have 'erc4337provider', remove shared dependencies or avoid two-way reference
  constructor (
    readonly config: ClientConfig,
    readonly originalSigner: Signer,
    readonly erc4337provider: ERC4337EthersProvider,
    readonly httpRpcClient: HttpRpcClient,
    readonly smartAccountAPI: BaseAccountAPI) {
    super()
    defineReadOnly(this, 'provider', erc4337provider)
  }

  address?: string

  // This one is called by Contract. It signs the request and passes in to Provider to be sent.
  async sendTransaction (transaction: Deferrable<TransactionRequest>): Promise<TransactionResponse> {
    const tx: TransactionRequest = await this.populateTransaction(transaction)
    await this.verifyAllNecessaryFields(tx)
    const userOperation = await this.smartAccountAPI.createSignedUserOp({
      target: tx.to ?? '',
      data: tx.data?.toString() ?? '',
      value: tx.value,
      gasLimit: tx.gasLimit,
      maxFeePerGas: tx.maxFeePerGas || undefined,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas || undefined
    })
    const transactionResponse = await this.erc4337provider.constructUserOpTransactionResponse(userOperation)
    try {
      await this.httpRpcClient.sendUserOpToBundler(userOperation)
    } catch (error: any) {
      throw this.unwrapError(error)
    }
    // TODO: handle errors - transaction that is "rejected" by bundler is _not likely_ to ever resolve its "wait()"
    return transactionResponse
  }

  async verifyAllNecessaryBatchFields (batchRequest: BatchTransactionRequest): Promise<void> {
    if (batchRequest.targets.length === 0) {
      throw new Error('Empty batch request')
    }
    if (batchRequest.targets.length !== batchRequest.datas.length || batchRequest.targets.length !== batchRequest.values.length) {
      throw new Error('Batch arrays must have the same length')
    }
    for (const target of batchRequest.targets) {
      if (target == null) {
        throw new Error('Missing call target in batch')
      }
    }
  }

  /**
   * Send a batch of transactions
   */
  async sendBatchTransaction(batchRequest: BatchTransactionRequest): Promise<TransactionResponse> {
    await this.verifyAllNecessaryBatchFields(batchRequest)

    // Convert values to BigNumber and ensure they're in the correct format
    const convertedRequest = {
      targets: batchRequest.targets,
      datas: batchRequest.datas.map(d => d || '0x'),
      values: batchRequest.values.map(v => BigNumber.from(v || 0)),
      gasLimit: batchRequest.gasLimit ? BigNumber.from(batchRequest.gasLimit) : undefined,
      maxFeePerGas: batchRequest.maxFeePerGas ? BigNumber.from(batchRequest.maxFeePerGas) : undefined,
      maxPriorityFeePerGas: batchRequest.maxPriorityFeePerGas ? BigNumber.from(batchRequest.maxPriorityFeePerGas) : undefined
    }

    const userOpDetails = {
      targets: convertedRequest.targets,
      datas: convertedRequest.datas,
      values: convertedRequest.values,
      ...(batchRequest.gasLimit !== undefined && { gasLimit: convertedRequest.gasLimit }),
      maxFeePerGas: convertedRequest.maxFeePerGas,
      maxPriorityFeePerGas: convertedRequest.maxPriorityFeePerGas
    }

    try {
      const userOperation = await this.smartAccountAPI.createSignedBatchUserOp(userOpDetails)
      const transactionResponse = await this.erc4337provider.constructUserOpTransactionResponse(userOperation)
      await this.httpRpcClient.sendUserOpToBundler(userOperation)
      return transactionResponse
    } catch (error: any) {
      console.error('sendUserOpToBundler failed', error)
      throw this.unwrapError(error)
    }
    // return transactionResponse
  }

  async estimateUserOpGas(transaction: Deferrable<TransactionRequest>): Promise<{callGasLimit: number, preVerificationGas: number, verificationGasLimit: number}> {
    const tx: TransactionRequest = await this.populateTransaction(transaction)
    await this.verifyAllNecessaryFields(tx)
    const callData = await this.smartAccountAPI.encodeExecute(
      tx.to ?? '', 
      tx.value ?? 0, 
      tx.data?.toString() ?? ''
    )
    return await this.estimateCalldataGas(callData)
  }

  async estimateBatchUserOpGas(batchRequest: BatchTransactionRequest): Promise<{callGasLimit: number, preVerificationGas: number, verificationGasLimit: number}> {
    await this.verifyAllNecessaryBatchFields(batchRequest)

    const convertedRequest = {
      targets: batchRequest.targets,
      datas: batchRequest.datas.map(d => d || '0x'),
      values: batchRequest.values.map(v => BigNumber.from(v || 0)),
    }

    const callData = await this.smartAccountAPI.encodeExecuteBatch(
      convertedRequest.targets, 
      convertedRequest.values,
      convertedRequest.datas
    )
    return await this.estimateCalldataGas(callData)
  }

  async estimateCalldataGas(callData: string): Promise<{callGasLimit: number, preVerificationGas: number, verificationGasLimit: number}> {   
    const factoryParams = await this.smartAccountAPI.getRequiredFactoryData()
    // const initGas = await this.smartAccountAPI.estimateCreationGas(factoryParams)
    // const verificationGasLimit = BigNumber.from(await this.smartAccountAPI.getVerificationGasLimit()).add(initGas)
    const paymasterData = await this.smartAccountAPI.paymasterAPI?.getPaymasterData({})

    const partialUserOp = {
      sender: await this.smartAccountAPI.getAccountAddress(),
      nonce: await this.smartAccountAPI.getNonce(),
      factory: factoryParams?.factory ?? undefined,
      factoryData: Buffer.from(factoryParams?.factoryData ?? '').toString('hex') || undefined,
      paymaster: paymasterData?.paymaster || undefined,
      paymasterData: paymasterData?.paymasterData || undefined,
      callData,
      signature: getDummySignature(this.smartAccountAPI.getSignatureMode())
    }

    return await this.httpRpcClient.estimateUserOpGas(partialUserOp)
  }

  unwrapError (errorIn: any): Error {
    if (errorIn.body != null) {
      const errorBody = JSON.parse(errorIn.body)
      let paymasterInfo: string = ''
      let failedOpMessage: string | undefined = errorBody?.error?.message
      if (failedOpMessage?.includes('FailedOp') === true) {
        // TODO: better error extraction methods will be needed
        const matched = failedOpMessage.match(/FailedOp\((.*)\)/)
        if (matched != null) {
          const split = matched[1].split(',')
          paymasterInfo = `(paymaster address: ${split[1]})`
          failedOpMessage = split[2]
        }
      }
      const error = new Error(`The bundler has failed to include UserOperation in a batch: ${failedOpMessage} ${paymasterInfo})`)
      error.stack = errorIn.stack
      return error
    }
    return errorIn
  }

  async verifyAllNecessaryFields (transactionRequest: TransactionRequest): Promise<void> {
    if (transactionRequest.to == null) {
      throw new Error('Missing call target')
    }
    if (transactionRequest.data == null && transactionRequest.value == null) {
      // TBD: banning no-op UserOps seems to make sense on provider level
      throw new Error('Missing call data or value')
    }
  }

  connect (provider: Provider): Signer {
    throw new Error('changing providers is not supported')
  }

  async getAddress (): Promise<string> {
    if (this.address == null) {
      this.address = await this.erc4337provider.getSenderAccountAddress()
    }
    return this.address
  }

  async signMessage (message: Bytes | string): Promise<string> {
    return await this.originalSigner.signMessage(message)
  }

  async signTransaction (transaction: Deferrable<TransactionRequest>): Promise<string> {
    throw new Error('not implemented')
  }

  async signUserOperation (userOperation: UserOperation): Promise<string> {
    const message = await this.smartAccountAPI.getUserOpHash(userOperation)
    return await this.originalSigner.signMessage(message)
  }
}
