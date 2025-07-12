import { ethers, BigNumber, BigNumberish } from 'ethers'
import { Provider } from '@ethersproject/providers'
import { EntryPoint, UserOperationStruct } from './contracts/EntryPoint'
import { EntryPoint__factory } from './contracts/factories/EntryPoint__factory'

import { TransactionDetailsForUserOp, BatchTransactionDetailsForUserOp } from './TransactionDetailsForUserOp'
import { resolveProperties } from 'ethers/lib/utils'
import { PaymasterAPI } from './PaymasterAPI'
import { getUserOpHash, NotPromise, packUserOp } from './utils/ERC4337Utils'
import { calcPreVerificationGas, GasOverheads } from './calcPreVerificationGas'
import { SignatureMode } from './SignatureMode'
import { HttpRpcClient } from './HttpRpcClient'
import Debug from 'debug'

const debug = Debug('aa.base')

export interface BaseApiParams {
  provider: Provider
  entryPointAddress: string
  accountAddress?: string
  overheads?: Partial<GasOverheads>
  paymasterAPI?: PaymasterAPI
  httpRpcClient: HttpRpcClient
}

export interface UserOpResult {
  transactionHash: string
  success: boolean
}

/**
 * Base class for all Smart Wallet ERC-4337 Clients to implement.
 * Subclass should inherit 5 methods to support a specific wallet contract:
 *
 * - getAccountInitCode - return the value to put into the "initCode" field, if the account is not yet deployed. should create the account instance using a factory contract.
 * - getNonce - return current account's nonce value
 * - encodeExecute - encode the call from entryPoint through our account to the target contract.
 * - signUserOpHash - sign the hash of a UserOp.
 *
 * The user can use the following APIs:
 * - createUnsignedUserOp - given "target" and "calldata", fill userOp to perform that operation from the account.
 * - createSignedUserOp - helper to call the above createUnsignedUserOp, and then extract the userOpHash and sign it
 */
export abstract class BaseAccountAPI {
  private senderAddress!: string
  private isPhantom = true
  // entryPoint connected to "zero" address. allowed to make static calls (e.g. to getSenderAddress)
  private readonly entryPointView: EntryPoint

  readonly httpRpcClient: HttpRpcClient

  provider: Provider
  overheads?: Partial<GasOverheads>
  entryPointAddress: string
  accountAddress?: string
  paymasterAPI?: PaymasterAPI

  /**
   * base constructor.
   * subclass SHOULD add parameters that define the owner (signer) of this wallet
   */
  protected constructor (params: BaseApiParams) {
    this.provider = params.provider
    this.overheads = params.overheads
    this.entryPointAddress = params.entryPointAddress
    this.accountAddress = params.accountAddress
    this.paymasterAPI = params.paymasterAPI
    this.httpRpcClient = params.httpRpcClient

    // factory "connect" define the contract address. the contract "connect" defines the "from" address.
    this.entryPointView = EntryPoint__factory.connect(params.entryPointAddress, params.provider).connect(ethers.constants.AddressZero)
  }

  async init (): Promise<this> {
    if (await this.provider.getCode(this.entryPointAddress) === '0x') {
      throw new Error(`entryPoint not deployed at ${this.entryPointAddress}`)
    }

    await this.getAccountAddress()
    return this
  }

  /**
   * return the value to put into the "initCode" field, if the contract is not yet deployed.
   * this value holds the "factory" address, followed by this account's information
   */
  abstract getAccountInitCode (): Promise<string>

  /**
   * return current account's nonce.
   */
  abstract getNonce (): Promise<BigNumber>

  /**
   * encode the call from entryPoint through our account to the target contract.
   * @param target
   * @param value
   * @param data
   */
  abstract encodeExecute (target: string, value: BigNumberish, data: string): Promise<string>

  /**
   * encode a batch of method calls from entryPoint through our account to the target contracts.
   * @param targets array of target addresses
   * @param values array of values
   * @param datas array of call data
   */
  abstract encodeExecuteBatch (targets: string[], values: BigNumberish[], datas: string[]): Promise<string>

  /**
   * sign a userOp's hash (userOpHash).
   * @param userOpHash
   */
  abstract signUserOpHash (userOpHash: string): Promise<string>

  /**
   * check if the contract is already deployed.
   */
  async checkAccountPhantom (): Promise<boolean> {
    if (!this.isPhantom) {
      // already deployed. no need to check anymore.
      return this.isPhantom
    }
    const senderAddressCode = await this.provider.getCode(this.getAccountAddress())
    if (senderAddressCode.length > 2) {
      // console.log(`SimpleAccount Contract already deployed at ${this.senderAddress}`)
      this.isPhantom = false
    } else {
      // console.log(`SimpleAccount Contract is NOT YET deployed at ${this.senderAddress} - working in "phantom account" mode.`)
    }
    return this.isPhantom
  }

  /**
   * calculate the account address even before it is deployed
   */
  async getCounterFactualAddress (): Promise<string> {
    const initCode = this.getAccountInitCode()
    // use entryPoint to query account address (factory can provide a helper method to do the same, but
    // this method attempts to be generic
    try {
      await this.entryPointView.callStatic.getSenderAddress(initCode)
    } catch (e: any) {
      if (e.errorArgs == null) {
        throw e
      }
      return e.errorArgs.sender
    }
    throw new Error('must handle revert')
  }

  /**
   * return initCode value to into the UserOp.
   * (either deployment code, or empty hex if contract already deployed)
   */
  async getInitCode (): Promise<string> {
    if (await this.checkAccountPhantom()) {
      return await this.getAccountInitCode()
    }
    return '0x'
  }

  /**
   * return maximum gas used for verification.
   * NOTE: createUnsignedUserOp will add to this value the cost of creation, if the contract is not yet created.
   */
  async getVerificationGasLimit (): Promise<BigNumberish> {
    const signatureMode = this.getSignatureMode()
    // Passkey signatures require more verification gas
    return signatureMode === SignatureMode.PASSKEY ? 500000 : 100000
  }

  /**
   * should cover cost of putting calldata on-chain, and some overhead.
   * actual overhead depends on the expected bundle size
   */
  async getPreVerificationGas (userOp: Partial<UserOperationStruct>): Promise<number> {
    const p = await resolveProperties(userOp)
    const signatureMode = this.getSignatureMode()
    debug('PreVerificationGas using signature mode: %s', signatureMode)
    return calcPreVerificationGas(p, {
      ...this.overheads,
      signatureMode
    })
  }

  /**
   * ABI-encode a user operation. used for calldata cost estimation
   */
  packUserOp (userOp: NotPromise<UserOperationStruct>): string {
    return packUserOp(userOp, false)
  }

  async encodeUserOpCallDataAndGasLimit (detailsForUserOp: TransactionDetailsForUserOp): Promise<{ 
    callData: string,
    callGasLimit: BigNumber,
    verificationGas: BigNumber,
    verificationGasLimit: BigNumber,
    preVerificationGas: BigNumber,
    totalGas: BigNumber,
    maxFeePerGas: BigNumber,
    maxPriorityFeePerGas: BigNumber
  }> {
    function parseNumber (a: any): BigNumber | null {
      if (a == null || a === '') return null
      return BigNumber.from(a.toString())
    }

    const value = parseNumber(detailsForUserOp.value) ?? BigNumber.from(0)
    const callData = await this.encodeExecute(detailsForUserOp.target, value, detailsForUserOp.data)

    debug('Starting estimation for: %o', {
      type: !detailsForUserOp.data || detailsForUserOp.data === '0x' ? 'Simple Transfer' : 'Contract Interaction',
      target: detailsForUserOp.target,
      value: value.toString(),
      hasCallData: !!detailsForUserOp.data && detailsForUserOp.data !== '0x'
    })

    // Log transaction details in a cleaner format
    debug('Transaction details: %o', {
      target: detailsForUserOp.target,
      value: value.toString(),
      data: detailsForUserOp.data === '0x' ? 'none' : 'present',
      signatureMode: this.getSignatureMode()
    })

    // If user provided gas limit, use it
    if (detailsForUserOp.gasLimit) {
      debug('Using provided gas limit: %s', detailsForUserOp.gasLimit.toString())
      return {
        callData,
        callGasLimit: BigNumber.from(detailsForUserOp.gasLimit),
        verificationGas: BigNumber.from(0),
        preVerificationGas: BigNumber.from(0),
        verificationGasLimit: BigNumber.from(0),
        totalGas: BigNumber.from(0),
        maxFeePerGas: BigNumber.from(0),
        maxPriorityFeePerGas: BigNumber.from(0)
      }
    }

    debug('Using bundler estimation...')
    const initCode = await this.getInitCode()
    const verificationGasLimit = await this.getVerificationGasLimit()

    debug('Preparing bundler estimation: %o', {
      signatureMode: this.getSignatureMode(),
      requestedVerificationGas: verificationGasLimit.toString()
    })

    const partialOp = {
      sender: await this.getAccountAddress(),
      nonce: await this.getNonce(),
      initCode,
      callData,
      callGasLimit: 0,
      verificationGasLimit,
      maxFeePerGas: 0,
      maxPriorityFeePerGas: 0,
      paymasterAndData: '0x',
      signature: '0x'
    }

    if (this.paymasterAPI != null) {
      partialOp.paymasterAndData = await this.paymasterAPI.getPaymasterAndData(partialOp) ?? '0x'
    }

    const bundlerEstimation = await this.httpRpcClient.estimateUserOpGas(partialOp)

    if (!bundlerEstimation.success) {
      throw new Error(bundlerEstimation.error ?? 'Bundler gas estimation failed')
    }

    const output = {
      callData,
      callGasLimit: BigNumber.from(bundlerEstimation.callGasLimit),
      verificationGas: BigNumber.from(bundlerEstimation.verificationGas),
      verificationGasLimit: BigNumber.from(verificationGasLimit),
      preVerificationGas: BigNumber.from(bundlerEstimation.preVerificationGas),
      totalGas: BigNumber.from(verificationGasLimit)
        .add(BigNumber.from(bundlerEstimation.callGasLimit))
        .add(BigNumber.from(bundlerEstimation.preVerificationGas)),
      maxFeePerGas: BigNumber.from(bundlerEstimation.maxFeePerGas),
      maxPriorityFeePerGas: BigNumber.from(bundlerEstimation.maxPriorityFeePerGas)
    }

    debug('Bundler estimation details: %o', output)
    return output
  }

  /**
   * return userOpHash for signing.
   * This value matches entryPoint.getUserOpHash (calculated off-chain, to avoid a view call)
   * @param userOp userOperation, (signature field ignored)
   */
  async getUserOpHash (userOp: UserOperationStruct): Promise<string> {
    const op = await resolveProperties(userOp)
    const chainId = await this.provider.getNetwork().then(net => net.chainId)
    return getUserOpHash(op, this.entryPointAddress, chainId)
  }

  /**
   * return the account's address.
   * this value is valid even before deploying the contract.
   */
  async getAccountAddress (): Promise<string> {
    if (this.senderAddress == null) {
      if (this.accountAddress != null) {
        this.senderAddress = this.accountAddress
      } else {
        this.senderAddress = await this.getCounterFactualAddress()
      }
    }
    return this.senderAddress
  }

  async estimateCreationGas (initCode?: string): Promise<BigNumberish> {
    if (initCode == null || initCode === '0x') return 0
    const deployerAddress = initCode.substring(0, 42)
    const deployerCallData = '0x' + initCode.substring(42)
    return await this.provider.estimateGas({ to: deployerAddress, data: deployerCallData })
  }

  /**
   * create a UserOperation, filling all details (except signature)
   * - if account is not yet created, add initCode to deploy it.
   * - if gas or nonce are missing, read them from the chain (note that we can't fill gaslimit before the account is created)
   * @param info
   */
  async createUnsignedUserOp (info: TransactionDetailsForUserOp): Promise<UserOperationStruct> {
    const {
      callData,
      callGasLimit
    } = await this.encodeUserOpCallDataAndGasLimit(info)
    const initCode = await this.getInitCode()

    const initGas = await this.estimateCreationGas(initCode)
    const verificationGasLimit = BigNumber.from(await this.getVerificationGasLimit())
      .add(initGas)

    let {
      maxFeePerGas,
      maxPriorityFeePerGas
    } = info
    if (maxFeePerGas == null || maxPriorityFeePerGas == null) {
      const feeData = await this.provider.getFeeData()
      if (maxFeePerGas == null) {
        maxFeePerGas = feeData.maxFeePerGas ?? undefined
      }
      if (maxPriorityFeePerGas == null) {
        maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? undefined
      }
    }

    const partialUserOp: any = {
      sender: this.getAccountAddress(),
      nonce: info.nonce ?? this.getNonce(),
      initCode,
      callData,
      callGasLimit,
      verificationGasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas,
      paymasterAndData: '0x'
    }

    let paymasterAndData: string | undefined
    if (this.paymasterAPI != null) {
      // fill (partial) preVerificationGas (all except the cost of the generated paymasterAndData)
      const userOpForPm = {
        ...partialUserOp,
        preVerificationGas: await this.getPreVerificationGas(partialUserOp)
      }
      paymasterAndData = await this.paymasterAPI.getPaymasterAndData(userOpForPm)
    }
    partialUserOp.paymasterAndData = paymasterAndData ?? '0x'
    return {
      ...partialUserOp,
      preVerificationGas: this.getPreVerificationGas(partialUserOp),
      signature: ''
    }
  }

  /**
   * Sign the filled userOp.
   * @param userOp the UserOperation to sign (with signature field ignored)
   */
  async signUserOp (userOp: UserOperationStruct): Promise<UserOperationStruct> {
    const userOpHash = await this.getUserOpHash(userOp)
    const signature = this.signUserOpHash(userOpHash)
    return {
      ...userOp,
      signature
    }
  }

  /**
   * helper method: create and sign a user operation.
   * @param info transaction details for the userOp
   */
  async createSignedUserOp (info: TransactionDetailsForUserOp): Promise<UserOperationStruct> {
    return await this.signUserOp(await this.createUnsignedUserOp(info))
  }

  /**
   * get the transaction that has this userOpHash mined, or null if not found
   * @param userOpHash returned by sendUserOpToBundler (or by getUserOpHash..)
   * @param timeout stop waiting after this timeout
   * @param interval time to wait between polls.
   * @return the transactionHash this userOp was mined, or null if not found.
   */
  async getUserOpReceipt (userOpHash: string, timeout = 30000, interval = 5000): Promise<string | null> {
    const endtime = Date.now() + timeout
    while (Date.now() < endtime) {
      const events = await this.entryPointView.queryFilter(this.entryPointView.filters.UserOperationEvent(userOpHash))
      if (events.length > 0) {
        return events[0].transactionHash
      }
      await new Promise(resolve => setTimeout(resolve, interval))
    }
    return null
  }

  /**
   * Get the signature mode for the current account
   * This should be implemented by derived classes
   */
  abstract getSignatureMode(): SignatureMode

  /**
   * encode batch operations for user operation call data and estimate gas
   */
  async encodeBatchUserOpCallDataAndGasLimit (detailsForUserOp: BatchTransactionDetailsForUserOp): Promise<{ 
    callData: string,
    callGasLimit: BigNumber,
    verificationGas: BigNumber,
    preVerificationGas: BigNumber,
    verificationGasLimit: BigNumber,
    totalGas: BigNumber,
    maxFeePerGas: BigNumber,
    maxPriorityFeePerGas: BigNumber
  }> {
    const { targets, values, datas } = detailsForUserOp

    // Validate arrays have same length
    if (targets.length !== values.length || targets.length !== datas.length) {
      throw new Error('Batch operation arrays must have the same length')
    }

    const callData = await this.encodeExecuteBatch(targets, values, datas)

    debug('Starting batch estimation for %d operations', targets.length)

    // If user provided gas limit, use it
    if (detailsForUserOp.gasLimit) {
      debug('Using provided gas limit: %s', detailsForUserOp.gasLimit.toString())
      return {
        callData,
        callGasLimit: BigNumber.from(detailsForUserOp.gasLimit),
        verificationGas: BigNumber.from(0),
        preVerificationGas: BigNumber.from(0),
        verificationGasLimit: BigNumber.from(0),
        totalGas: BigNumber.from(0),
        maxFeePerGas: BigNumber.from(0),
        maxPriorityFeePerGas: BigNumber.from(0)
      }
    }

    debug('Using bundler estimation for batch operations...')
    const initCode = await this.getInitCode()
    const verificationGasLimit = await this.getVerificationGasLimit()

    debug('Preparing bundler estimation for batch: %o', {
      signatureMode: this.getSignatureMode(),
      requestedVerificationGas: verificationGasLimit.toString()
    })

    const partialOp = {
      sender: await this.getAccountAddress(),
      nonce: await this.getNonce(),
      initCode,
      callData,
      callGasLimit: 0,
      verificationGasLimit,
      maxFeePerGas: 0,
      maxPriorityFeePerGas: 0,
      paymasterAndData: '0x',
      signature: '0x'
    }

    if (this.paymasterAPI != null) {
      partialOp.paymasterAndData = await this.paymasterAPI.getPaymasterAndData(partialOp) ?? '0x'
    }

    const bundlerEstimation = await this.httpRpcClient.estimateUserOpGas(partialOp)

    if (!bundlerEstimation.success) {
      throw new Error(bundlerEstimation.error ?? 'Bundler gas estimation failed for batch operation')
    }

    const output = {
      callData,
      callGasLimit: BigNumber.from(bundlerEstimation.callGasLimit),
      verificationGas: BigNumber.from(bundlerEstimation.verificationGas),
      verificationGasLimit: BigNumber.from(verificationGasLimit),
      preVerificationGas: BigNumber.from(bundlerEstimation.preVerificationGas),
      totalGas: BigNumber.from(verificationGasLimit)
        .add(BigNumber.from(bundlerEstimation.callGasLimit))
        .add(BigNumber.from(bundlerEstimation.preVerificationGas)),
      maxFeePerGas: BigNumber.from(bundlerEstimation.maxFeePerGas),
      maxPriorityFeePerGas: BigNumber.from(bundlerEstimation.maxPriorityFeePerGas)
    }

    debug('Bundler estimation details for batch: %o', output)
    return output
  }

  /**
   * create a batch UserOperation, filling all details (except signature)
   */
  async createUnsignedBatchUserOp (info: BatchTransactionDetailsForUserOp): Promise<UserOperationStruct> {
    const {
      callData,
      callGasLimit
    } = await this.encodeBatchUserOpCallDataAndGasLimit(info)
    const initCode = await this.getInitCode()

    const initGas = await this.estimateCreationGas(initCode)
    const verificationGasLimit = BigNumber.from(await this.getVerificationGasLimit())
      .add(initGas)

    let {
      maxFeePerGas,
      maxPriorityFeePerGas
    } = info
    if (maxFeePerGas == null || maxPriorityFeePerGas == null) {
      const feeData = await this.provider.getFeeData()
      if (maxFeePerGas == null) {
        maxFeePerGas = feeData.maxFeePerGas ?? undefined
      }
      if (maxPriorityFeePerGas == null) {
        maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? undefined
      }
    }

    const partialUserOp: any = {
      sender: await this.getAccountAddress(),
      nonce: info.nonce ?? await this.getNonce(),
      initCode,
      callData,
      callGasLimit,
      verificationGasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas,
      paymasterAndData: '0x'
    }

    let paymasterAndData: string | undefined
    if (this.paymasterAPI != null) {
      // fill (partial) preVerificationGas (all except the cost of the generated paymasterAndData)
      const userOpForPm = {
        ...partialUserOp,
        preVerificationGas: await this.getPreVerificationGas(partialUserOp)
      }
      paymasterAndData = await this.paymasterAPI.getPaymasterAndData(userOpForPm)
    }
    partialUserOp.paymasterAndData = paymasterAndData ?? '0x'
    return {
      ...partialUserOp,
      preVerificationGas: await this.getPreVerificationGas(partialUserOp),
      signature: ''
    }
  }

  /**
   * helper method: create and sign a batch user operation.
   */
  async createSignedBatchUserOp (info: BatchTransactionDetailsForUserOp): Promise<UserOperationStruct> {
    return await this.signUserOp(await this.createUnsignedBatchUserOp(info))
  }
}
