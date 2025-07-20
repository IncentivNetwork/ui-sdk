import { BigNumberish, BytesLike } from "ethers";

export type PackedUserOperation = {
    sender: string;
    nonce: BigNumberish;
    initCode: BytesLike;
    callData: BytesLike;
    accountGasLimits: BytesLike;
    preVerificationGas: BigNumberish;
    gasFees: BytesLike;
    paymasterAndData: BytesLike;
    signature: BytesLike;
};

export enum SignatureMode {
    EOA = 'EOA',
    PASSKEY = 'PASSKEY'
}