import { BigNumberish } from 'ethers'

export interface TransactionDetailsForUserOp {
  target: string
  data: string
  value?: BigNumberish
  gasLimit?: BigNumberish
  maxFeePerGas?: BigNumberish
  maxPriorityFeePerGas?: BigNumberish
  nonce?: BigNumberish
}

export interface BatchTransactionDetailsForUserOp {
  targets: string[]
  datas: string[]
  values: BigNumberish[]
  gasLimit?: BigNumberish
  maxFeePerGas?: BigNumberish
  maxPriorityFeePerGas?: BigNumberish
  nonce?: BigNumberish
}
