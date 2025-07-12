import { UserOperationStruct } from './contracts/EntryPoint'
import { NotPromise, packUserOp } from './utils/ERC4337Utils'
import { arrayify, hexlify } from 'ethers/lib/utils'
import { SignatureMode } from './SignatureMode'
import Debug from 'debug'

const debug = Debug('aa.gas')

// Signature sizes for different types
export const SignatureSizes = {
  EOA: 65,      // r,s,v signature (32 + 32 + 1)
  PASSKEY: 536  // Passkey signature size
}

export interface GasOverheads {
  /**
   * fixed overhead for entire handleOp bundle.
   */
  fixed: number

  /**
   * per userOp overhead, added on top of the above fixed per-bundle.
   */
  perUserOp: number

  /**
   * overhead for userOp word (32 bytes) block
   */
  perUserOpWord: number

  // perCallDataWord: number

  /**
   * zero byte cost, for calldata gas cost calculations
   */
  zeroByte: number

  /**
   * non-zero byte cost, for calldata gas cost calculations
   */
  nonZeroByte: number

  /**
   * expected bundle size, to split per-bundle overhead between all ops.
   */
  bundleSize: number

  /**
   * signature mode (EOA or PASSKEY)
   */
  signatureMode?: SignatureMode
}

export const DefaultGasOverheads: GasOverheads = {
  fixed: 21000,
  perUserOp: 26000,
  perUserOpWord: 4,
  zeroByte: 4,
  nonZeroByte: 16,
  bundleSize: 1,
  signatureMode: SignatureMode.EOA
}

/**
 * calculate the preVerificationGas of the given UserOperation
 * preVerificationGas (by definition) is the cost overhead that can't be calculated on-chain.
 * it is based on parameters that are defined by the Ethereum protocol for external transactions.
 * @param userOp filled userOp to calculate. The only possible missing fields can be the signature and preVerificationGas itself
 * @param overheads gas overheads to use, to override the default values
 */
export function calcPreVerificationGas(userOp: Partial<NotPromise<UserOperationStruct>>, overheads?: Partial<GasOverheads>): number {
  debug('Calculating preVerificationGas...')

  const ov = { ...DefaultGasOverheads, ...(overheads ?? {}) }

  // Determine signature size based on signature mode
  const sigSize = ov.signatureMode === SignatureMode.PASSKEY ?
    SignatureSizes.PASSKEY :
    SignatureSizes.EOA

  debug('Using signature mode:', ov.signatureMode, 'with size:', sigSize)

  const p: NotPromise<UserOperationStruct> = {
    preVerificationGas: 21000,
    signature: hexlify(Buffer.alloc(sigSize, 1)),
    ...userOp
  } as any

  const packed = arrayify(packUserOp(p, false))
  const lengthInWord = (packed.length + 31) / 32
  const callDataCost = packed.map(x => x === 0 ? ov.zeroByte : ov.nonZeroByte).reduce((sum, x) => sum + x)

  const baseGas = ov.fixed / ov.bundleSize
  const userOpGas = ov.perUserOp
  const wordGas = ov.perUserOpWord * lengthInWord

  const ret = Math.round(
    callDataCost +
    baseGas +
    userOpGas +
    wordGas
  )

  debug('Gas calculation:', {
    sigSize,
    signatureMode: ov.signatureMode,
    baseGas,
    userOpGas,
    wordGas,
    callDataCost,
    total: ret
  })

  return Math.max(ret, 49024)  // Ensure we never return less than the bundler minimum
}
