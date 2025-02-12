import { BigNumber, ContractFactory } from 'ethers';

/**
 * Input for contract deployment operations
 * Can be either raw bytecode with optional constructor args
 * or an ethers ContractFactory instance
 */
export type DeploymentInput =
  | { bytecode: string; constructorArgs?: any[] }
  | ContractFactory;

/**
 * Contract information for deployment
 */
export interface ContractInfo {
  /** Contract bytecode */
  bytecode: string;
  /** Optional contract ABI - only needed if you want a Contract instance returned */
  abi?: any[];
  /** Optional constructor arguments */
  constructorArgs?: any[];
}

/**
 * Options for contract deployment operations
 */
export interface DeploymentOptions {
  /** Salt for CREATE2 deployment - if not provided, a deterministic salt will be used */
  salt?: string;
  /** Optional constructor arguments for the contract */
  constructorArgs?: any[];
}

/**
 * Result of a contract deployment operation
 */
export interface DeploymentResult {
  /** Transaction hash of the deployment transaction */
  transactionHash: string;
}

/**
 * Gas estimation result for contract deployment
 */
export interface DeploymentGasEstimate {
  /** Estimated gas required for deployment */
  gasLimit: BigNumber;
  /** Estimated gas price */
  gasPrice: BigNumber;
  /** Total estimated cost (gasLimit * gasPrice) */
  totalCost: BigNumber;
}

/**
 * Error types specific to contract deployment
 */
export enum DeploymentErrorType {
  /** When the provided bytecode is invalid */
  INVALID_BYTECODE = 'INVALID_BYTECODE',
  /** When CREATE2 deployer contract is invalid/not found */
  INVALID_DEPLOYER = 'INVALID_DEPLOYER'
}

/**
 * Custom error class for deployment-related errors
 */
export class DeploymentError extends Error {
  constructor(
    public type: DeploymentErrorType,
    message: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'DeploymentError';
  }
}