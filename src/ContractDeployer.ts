import { BigNumber, Contract, ContractFactory, ethers } from 'ethers';
import { hexlify } from 'ethers/lib/utils';
import { ERC4337EthersProvider } from './ERC4337EthersProvider';
import {
  DeploymentError,
  DeploymentErrorType,
  DeploymentInput,
  DeploymentResult,
} from './types/deployment';
import Debug from 'debug';

const debug = Debug('aa.deploy');

// CREATE2 deployer contract ABI - only the methods we need
const DEPLOYER_ABI = [
  'function deploy(bytes memory bytecode, bytes32 salt) public returns (address)',
  'function computeAddress(bytes32 bytecodeHash, bytes32 salt, address deployer) public pure returns (address)',
];

// Default salt to use when none is provided
const DEFAULT_SALT = '0x0000000000000000000000000000000000000000000000000000000000000001';

interface BundlerEstimation {
  callGasLimit: number;
  preVerificationGas: number;
  verificationGas: number;
  success: boolean;
  error?: string;
}

/**
 * ContractDeployer handles smart contract deployments through a CREATE2 deployer contract
 * using Account Abstraction. All deployments go through the EntryPoint.
 */
export class ContractDeployer {
  private deployerContract: Contract;

  constructor(
    private deployContractAddress: string,
    private provider: ERC4337EthersProvider,
    private signer: ethers.Signer
  ) {
    // Use the AA provider's signer instead of the original signer
    this.deployerContract = new Contract(deployContractAddress, DEPLOYER_ABI, this.provider.getSigner());
  }

  /**
   * Deploy a contract using either ContractFactory or raw bytecode
   */
  async deploy(
    input: DeploymentInput,
    salt: string = DEFAULT_SALT,
    options?: { gasLimit?: BigNumber }
  ): Promise<DeploymentResult> {
    try {
      // Get bytecode based on input type
      const bytecode = this._getBytecode(input);
      this._validateBytecode(bytecode);

      // Get the deployment transaction data
      const deployData = this.deployerContract.interface.encodeFunctionData('deploy', [bytecode, salt]);

      // Create UserOperation details
      const userOpDetails = {
        target: this.deployContractAddress,
        data: deployData,
        value: 0,
        ...(options?.gasLimit && { gasLimit: options.gasLimit })
      };

      debug('Creating UserOperation for deployment:', {
        target: this.deployContractAddress,
        dataLength: deployData.length,
        hasGasLimit: !!options?.gasLimit
      });

      // Create and sign the UserOperation using the smart account
      const userOperation = await this.provider.smartAccountAPI.createSignedUserOp(userOpDetails);

      // Get transaction response for tracking
      const transactionResponse = await this.provider.constructUserOpTransactionResponse(userOperation);

      // Fire and forget - let wallet handle tracking
      this.provider.httpRpcClient.sendUserOpToBundler(userOperation);
      debug('UserOperation submitted to bundler');

      return {
        transactionHash: transactionResponse.hash
      };
    } catch (error: any) {
      debug('Deployment preparation failed:', {
        error: error.message,
        code: error.code,
        type: error.type
      });
      throw error;
    }
  }

  private async _verifyContract() {
    // Check network first
    const network = await this.provider.getNetwork();
    debug('Verifying network configuration:', {
      chainId: network.chainId,
      name: network.name,
      ensAddress: network.ensAddress
    });

    // Check if contract exists
    const code = await this.provider.getCode(this.deployContractAddress);
    debug('Verifying deployer contract:', {
      address: this.deployContractAddress,
      hasCode: code !== '0x',
      codeLength: code.length,
      codeSample: code === '0x' ? '0x' : code.substring(0, 64) + '...'
    });

    if (code === '0x') {
      throw new DeploymentError(
        DeploymentErrorType.INVALID_DEPLOYER,
        `No contract found at address ${this.deployContractAddress} on network ${network.chainId}`
      );
    }

    // Try to encode function calls to verify interface
    try {
      const testBytecode = '0x1234';
      const testSalt = '0x0000000000000000000000000000000000000000000000000000000000000001';

      // Test deploy function
      const deployData = this.deployerContract.interface.encodeFunctionData('deploy', [testBytecode, testSalt]);

      // Test computeAddress function
      const computeData = this.deployerContract.interface.encodeFunctionData('computeAddress', [
        ethers.utils.keccak256(testBytecode),
        testSalt,
        this.deployContractAddress
      ]);

      debug('Verifying deployer contract interface:', {
        address: this.deployContractAddress,
        hasCode: code !== '0x',
        functions: {
          deploy: deployData.substring(0, 64) + '...',
          computeAddress: computeData.substring(0, 64) + '...'
        }
      });

      // Try to make a static call to verify the function exists
      const staticContract = new Contract(this.deployContractAddress, DEPLOYER_ABI, this.provider);
      await staticContract.callStatic.computeAddress(
        ethers.utils.keccak256(testBytecode),
        testSalt,
        this.deployContractAddress
      );
    } catch (error) {
      debug('Contract interface verification failed:', error);
      throw new DeploymentError(
        DeploymentErrorType.INVALID_DEPLOYER,
        `Contract at ${this.deployContractAddress} does not match expected interface`
      );
    }
  }

  /**
   * Predict the address where a contract will be deployed
   */
  async predictAddress(
    input: DeploymentInput,
    salt: string = DEFAULT_SALT
  ): Promise<string> {
    const bytecode = this._getBytecode(input);
    this._validateBytecode(bytecode);

    // Verify contract first
    await this._verifyContract();

    const bytecodeHash = ethers.utils.keccak256(bytecode);

    debug('Predicting deployment address:', {
      bytecodeHash,
      salt,
      factoryAddress: this.deployContractAddress,
      chainId: (await this.provider.getNetwork()).chainId
    });

    // Create a contract instance with the provider (not signer) for static calls
    const staticContract = new Contract(this.deployContractAddress, DEPLOYER_ABI, this.provider);

    // Make a static call to computeAddress
    try {
      return await staticContract.callStatic.computeAddress(
        bytecodeHash,
        salt,
        this.deployContractAddress  // The factory itself is the deployer for CREATE2
      );
    } catch (error) {
      debug('Address prediction failed:', error);
      throw error;
    }
  }

  /**
   * Validate bytecode format
   */
  private _validateBytecode(bytecode: string): void {
    if (!bytecode || !bytecode.startsWith('0x')) {
      throw new DeploymentError(
        DeploymentErrorType.INVALID_BYTECODE,
        'Invalid bytecode format'
      );
    }
  }

  /**
   * Get bytecode from input
   */
  private _getBytecode(input: DeploymentInput): string {
    try {
      if (input instanceof ContractFactory) {
        return input.bytecode;
      }

      const { bytecode, constructorArgs } = input;
      if (!constructorArgs || constructorArgs.length === 0) {
        return bytecode;
      }

      // Create temporary factory to encode constructor args
      const factory = new ContractFactory(
        ['constructor(...args)'], // Minimal ABI just for constructor
        bytecode,
        this.signer
      );
      return factory.getDeployTransaction(...constructorArgs).data as string;
    } catch (error) {
      throw new DeploymentError(
        DeploymentErrorType.INVALID_BYTECODE,
        'Failed to process contract bytecode',
        error as Error
      );
    }
  }

  /**
   * Estimate gas for contract deployment
   * Uses the same code path as actual deployment to ensure accuracy
   */
  async estimateGas(
    input: DeploymentInput,
    salt: string = DEFAULT_SALT
  ): Promise<BigNumber> {
    try {
      // Get bytecode based on input type
      const bytecode = this._getBytecode(input);
      this._validateBytecode(bytecode);

      // Get the deployment transaction data
      const deployData = this.deployerContract.interface.encodeFunctionData('deploy', [bytecode, salt]);

      // Create UserOperation details for estimation
      const userOpDetails = {
        target: this.deployContractAddress,
        data: deployData,
        value: 0
      };

      debug('Estimating gas for deployment:', {
        target: this.deployContractAddress,
        dataLength: deployData.length
      });

      // Use the smart account's internal estimation
      const { callGasLimit } = await this.provider.smartAccountAPI.encodeUserOpCallDataAndGasLimit(userOpDetails);

      debug('Gas estimation completed:', {
        callGasLimit: callGasLimit.toString()
      });

      return callGasLimit;
    } catch (error: any) {
      debug('Gas estimation failed:', {
        error: error.message,
        code: error.code,
        type: error.type
      });
      throw error;
    }
  }
}