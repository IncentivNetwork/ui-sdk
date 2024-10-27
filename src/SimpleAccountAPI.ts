import { BigNumber, BigNumberish } from 'ethers'
import {AddressZero, HashZero} from "@ethersproject/constants"
import {
  SimpleAccount,
  SimpleAccount__factory, SimpleAccountFactory,
  SimpleAccountFactory__factory
} from '@account-abstraction/contracts'

import { arrayify, hexlify, zeroPad, hexConcat, Interface } from 'ethers/lib/utils'
import { Signer } from '@ethersproject/abstract-signer'
import { BaseApiParams, BaseAccountAPI } from './BaseAccountAPI'

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
    if (!this.factory) {
      if (this.factoryAddress) {
        this.factory = SimpleAccountFactory__factory.connect(this.factoryAddress, this.provider)
      } else {
        throw new Error('No factory to get initCode')
      }
    }

    const createAccountAbi = [
      'function createAccount(address owner, bytes32[2] memory publicKey, uint256 salt) external payable returns (SimpleAccount)',
    ]

    let createAccountParams: any

    // Check if the owner has a publicKey property (indicating a Passkey account)
    if (hasPublicKey(this.owner as any)) {
      const publicKey = (this.owner as any).publicKey

      // Provide the public key and set owner to zero address
      createAccountParams = [
        AddressZero,
        [
          publicKey.x, // Hex string for public key's X coordinate
          publicKey.y // Hex string for public key's Y coordinate
        ],
        this.index
      ];
    } else {
      // Fetch the owner address (EOA account)
      const ownerAddress = await this.owner.getAddress()

      // Provide owner address and set publicKey to zeros
      createAccountParams = [
        ownerAddress,
        [HashZero, HashZero],
        this.index
      ]
    }

    // Create ethers Interface using the ABI
    const createAccountInterface = new Interface(createAccountAbi)

    // Encode function data using the ABI and parameters
    const encodedFunctionData = createAccountInterface.encodeFunctionData('createAccount', createAccountParams)

    return hexConcat([this.factory.address, encodedFunctionData])
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
    const signedMessage = await this.owner.signMessage(arrayify(userOpHash))
    const versionBytes = zeroPad(
      hexlify(hasPublicKey(this.owner) ? 1 : 0),
      1 // Zero-pad to 1 byte
    )
    return hexConcat([versionBytes, signedMessage])
  }
}
