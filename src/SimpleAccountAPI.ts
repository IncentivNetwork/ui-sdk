import { BigNumber, BigNumberish } from 'ethers'
import {
  SimpleAccount,
  SimpleAccount__factory, SimpleAccountFactory,
  SimpleAccountFactory__factory
} from '@account-abstraction/contracts'

import { arrayify, hexConcat, Interface } from 'ethers/lib/utils'
import { Signer } from '@ethersproject/abstract-signer'
import { BaseApiParams, BaseAccountAPI } from './BaseAccountAPI'

function hasPublicKey(obj: any): obj is { publicKey: { x: string; y: string } } {
  return obj && obj.publicKey &&
         typeof obj.publicKey.x === 'string' &&
         typeof obj.publicKey.y === 'string';
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
 * An implementation of the BaseAccountAPI using the SimpleAccount contract.
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
  accountContract?: SimpleAccount

  factory?: SimpleAccountFactory

  constructor (params: SimpleAccountApiParams) {
    super(params)
    this.factoryAddress = params.factoryAddress
    this.owner = params.owner
    this.index = BigNumber.from(params.index ?? 0)
  }

  async _getAccountContract (): Promise<SimpleAccount> {
    if (this.accountContract == null) {
      this.accountContract = SimpleAccount__factory.connect(await this.getAccountAddress(), this.provider)
    }
    return this.accountContract
  }

  /**
   * return the value to put into the "initCode" field, if the account is not yet deployed.
   * this value holds the "factory" address, followed by this account's information
   */
  async getAccountInitCode (): Promise<string> {
    if (this.factory == null) {
      if (this.factoryAddress != null && this.factoryAddress !== '') {
        this.factory = SimpleAccountFactory__factory.connect(this.factoryAddress, this.provider)
      } else {
        throw new Error('no factory to get initCode')
      }
    }

    let createAccountAbi: string[]
    let walletIdentifier: any

    // Check if the owner has a publicKey property
    if (hasPublicKey(this.owner as any)) {
      const publicKey = (this.owner as any).publicKey;

      // If publicKey is present, use the ABI for publicKey
      createAccountAbi = [
        "function createAccount(bytes32[2] memory publicKey) external payable returns (SimpleAccount)"
      ]
      // Provide the public key as an array of two 32-byte hex strings
      walletIdentifier = [publicKey.x, publicKey.y];
    } else {
      // Fetch the owner address only if the publicKey is not present
      const ownerAddress = await this.owner.getAddress();

      // Otherwise, use the ABI for owner address and index
      createAccountAbi = [
        "function createAccount(address owner, uint256 index) external payable returns (SimpleAccount)"
      ]
      walletIdentifier = [ownerAddress, this.index]
    }

    // Create ethers Interface using the appropriate ABI
    const createAccountInterface = new Interface(createAccountAbi);

    // Encode function data using the ABI and parameters
    const encodedFunctionData = createAccountInterface.encodeFunctionData('createAccount', walletIdentifier);

    return hexConcat([
      this.factory.address,
      encodedFunctionData
    ]);
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

  async signUserOpHash (userOpHash: string): Promise<string> {
    return await this.owner.signMessage(arrayify(userOpHash))
  }
}
