import { BigNumber, BigNumberish, ethers } from 'ethers'

import { IncentivAccount } from './contracts/IncentivAccount'
import { IncentivAccount__factory } from './contracts/factories/IncentivAccount__factory'
import { IncentivAccountFactory } from './contracts/IncentivAccountFactory'
import { IncentivAccountFactory__factory } from './contracts/factories/IncentivAccountFactory__factory'

import { hexlify, zeroPad, arrayify, hexConcat } from 'ethers/lib/utils'
import { Signer } from '@ethersproject/abstract-signer'
import { BaseApiParams, BaseAccountAPI, FactoryParams } from './BaseAccountAPI'
import { SignatureMode } from './utils/Types'

function hasPublicKey(owner: any): owner is { publicKey: { x: string; y: string } } {
  return owner && owner.publicKey &&
         typeof owner.publicKey.x === 'string' &&
         typeof owner.publicKey.y === 'string'
}

/**
 * constructor params, added no top of base params:
 * @param owner the signer object for the account owner
 * @param factoryAddress address of contract "factory" to deploy new contracts (not needed if account already deployed)
 * @param index nonce value used when creating multiple accounts for the same owner
 */
export interface SimpleAccountApiParams extends BaseApiParams {
  owner: Signer
  factoryAddress?: string
  index?: BigNumberish
}

/**
 * An implementation of the BaseAccountAPI using the IncentivAccount contract.
 * - contract deployer gets "entrypoint", "owner" addresses and "index" nonce
 * - owner signs requests using normal "Ethereum Signed Message" (ether's signer.signMessage())
 * - nonce method is "nonce()"
 * - execute method is "execFromEntryPoint()"
 */
export class SimpleAccountAPI extends BaseAccountAPI {
  factoryAddress?: string
  owner: Signer
  index: BigNumberish

  /**
   * our account contract.
   * should support the "execFromEntryPoint" and "nonce" methods
   */
  accountContract?: IncentivAccount

  factory?: IncentivAccountFactory

  constructor (params: SimpleAccountApiParams) {
    super(params)
    this.factoryAddress = params.factoryAddress
    this.owner = params.owner
    this.index = BigNumber.from(params.index ?? 0)
  }

  async _getAccountContract (): Promise<IncentivAccount> {
    if (this.accountContract == null) {
      this.accountContract = IncentivAccount__factory.connect(await this.getAccountAddress(), this.provider)
    }
    return this.accountContract
  }

  /**
   * return the value to put into the "initCode" field, if the account is not yet deployed.
   * this value holds the "factory" address, followed by this account's information
   */
  async getFactoryData (): Promise<FactoryParams | null> {
    if (this.factory == null) {
      if (this.factoryAddress != null && this.factoryAddress !== '') {
        this.factory = IncentivAccountFactory__factory.connect(this.factoryAddress, this.provider)
      } else {
        throw new Error('no factory to get initCode')
      }
    }

    const params = (
      hasPublicKey(await this.owner) ? 
      [ethers.constants.AddressZero, [(this.owner as any).publicKey.x, (this.owner as any).publicKey.y], this.index] : 
      [await this.owner.getAddress(), [ethers.constants.HashZero, ethers.constants.HashZero], this.index]
    ) as [string, [string, string], BigNumberish]

    return {
      factory: this.factory.address,
      factoryData: this.factory.interface.encodeFunctionData('createAccount', params)
    }
  }

  async getNonce (): Promise<BigNumber> {
    if (await this.checkAccountPhantom()) {
      return BigNumber.from(0)
    }
    const accountContract = await this._getAccountContract()
    return await accountContract.getNonce()
  }

  /**
   * encode a method call from entryPoint to our contract
   * @param target
   * @param value
   * @param data
   */
  async encodeExecute (target: string, value: BigNumberish, data: string): Promise<string> {
    const accountContract = await this._getAccountContract()
    return accountContract.interface.encodeFunctionData(
      'execute',
      [
        target,
        value,
        data
      ])
  }

  /**
   * encode a batch of method calls from entryPoint to our contract
   * @param targets array of target addresses
   * @param values array of values
   * @param datas array of call data
   */
  async encodeExecuteBatch (targets: string[], values: BigNumberish[], datas: string[]): Promise<string> {
    const accountContract = await this._getAccountContract()
    return accountContract.interface.encodeFunctionData(
      'executeBatch',
      [
        targets, 
        values, 
        datas
      ])
  }

  async signUserOpHash (userOpHash: string): Promise<string> {
    const signedMessage = await this.owner.signMessage(arrayify(userOpHash))
    
    // Insert version byte (EOA = 0, Passkey = 1)
    const versionBytes = zeroPad(
      hexlify(hasPublicKey(this.owner) ? 1 : 0),
      1
    )

    // Insert Wallet ID, 0 if not set (2 bytes)
    let walletId = (this.owner as any).walletId || 1;
    const walletIdBytes = zeroPad(
      hexlify(walletId),
      2
    )

    return hexConcat([versionBytes, walletIdBytes, signedMessage])
  }

  /**
   * Get the signature mode based on the owner type
   */
  getSignatureMode(): SignatureMode {
    return hasPublicKey(this.owner) ? SignatureMode.PASSKEY : SignatureMode.EOA
  }
}
