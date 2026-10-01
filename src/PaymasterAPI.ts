import { UserOperation } from './utils/ERC4337Utils'
import { BigNumberish, BytesLike } from 'ethers'

/**
 * returned paymaster parameters.
 * note that if a paymaster is specified, then the gasLimits must be specified
 * (even if postOp is not called, the paymasterPostOpGasLimit must be set to zero)
 */
export interface PaymasterParams {
  paymaster: string
  paymasterData?: BytesLike
  paymasterVerificationGasLimit: BigNumberish
  paymasterPostOpGasLimit: BigNumberish
}

/**
 * an API to external a UserOperation with paymaster info
 */
export class PaymasterAPI {
  private paymasterAndData: string = '0x'

  /**
   * Sets the paymaster and data value
   * @param value the value to use for paymasterAndData
   */
  setPaymasterAndData(value: string): void {
    this.paymasterAndData = value
  }

  /**
   * return temporary values to put into the paymaster fields.
   * @param userOp the partially-filled UserOperation. Should be filled with tepmorary values for all
   *    fields except paymaster fields.
   * @return temporary paymaster parameters, that can be used for gas estimations
   */
  async getTemporaryPaymasterData (userOp: Partial<UserOperation>): Promise<PaymasterParams | null> {
    return null
  }

  /**
   * @param userOp a partially-filled UserOperation (without signature and paymasterAndData
   *  note that the "preVerificationGas" is incomplete: it can't account for the
   *  paymasterAndData value, which will only be returned by this method..
   * @returns the value to put into the PaymasterAndData, undefined to leave it empty
   */
  async getPaymasterData (userOp: Partial<UserOperation>): Promise<PaymasterParams | null> {
    if(this.paymasterAndData === '0x') {
      return null
    }
    
    return {
      paymaster: this.paymasterAndData.substring(0, 42),
      paymasterData: '0x',
      paymasterVerificationGasLimit: '1000000',
      paymasterPostOpGasLimit: '1000000'
    }
  }

  async getPaymasterAndData (userOp: Partial<UserOperation>): Promise<string | undefined> {
    return this.paymasterAndData
  }
}
