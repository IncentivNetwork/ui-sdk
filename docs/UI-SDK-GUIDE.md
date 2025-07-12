# UI-SDK Implementation Guide

## Table of Contents
- [Introduction](#introduction)
- [Installation](#installation)
- [Account Abstraction Providers](#account-abstraction-providers)
  - [Creating an EOA-based Account Abstraction Provider](#creating-an-eoa-based-account-abstraction-provider)
  - [Creating a Passkey-based Account Abstraction Provider](#creating-a-passkey-based-account-abstraction-provider)
    - [Passkey Registration](#passkey-registration)
    - [Passkey Authentication](#passkey-authentication)
    - [Passkey Signer Implementation](#passkey-signer-implementation)
- [Transaction Operations](#transaction-operations)
  - [Single Transactions](#single-transactions)
  - [Batch Transactions](#batch-transactions)
  - [Contract Deployment](#contract-deployment)
- [Gas Management](#gas-management)
  - [Gas Estimation](#gas-estimation)
  - [Gas Price](#gas-price)
- [Basic Interactions](#basic-interactions)

## Introduction

UI-SDK is the go-to approach for implementing Account Abstraction (AA) capabilities in Incentiv applications by providing a streamlined interface for communicating with ERC-4337 bundlers. It supports both EOA (Externally Owned Account) and Passkey-based authentication methods for creating AA wallets.

### What is Account Abstraction?

Account Abstraction (ERC-4337) allows users to interact with smart contracts using smart contract wallets instead of Externally Owned Accounts (EOAs). This enables features like:
- Multi-signature requirements
- Account recovery mechanisms
- Transaction batching
- Gas abstraction (sponsored transactions)
- Custom validation logic
- Transaction authorization rules
- Transaction whitelisting/blacklisting
- Spending limits and quotas
- Time-based transaction locks
- Custom security policies

The UI-SDK simplifies the implementation of these features by providing a high-level interface built on top of ERC-4337. It acts as a communication layer between your application and the bundler network, handling:
- UserOperation creation and signing
- Bundler interaction and submission
- Gas estimation and optimization
- Transaction status tracking
- Account management
- Signature validation

### Browser Compatibility

For Passkey-based authentication:
- Chrome/Edge: Version 67 or later
- Safari: Version 14 or later
- Firefox: Version 60 or later
- Mobile: iOS 15+ (Safari), Android 7+ (Chrome)

## Installation

```bash
npm install ui-sdk ethers@5.7.2
# or
yarn add ui-sdk ethers@5.7.2
```

## Account Abstraction Providers

### Configuration

Before creating any Account Abstraction provider, you need to configure the SDK with the following required parameters:

```javascript
const config = {
  chainId: 11690,                    // The blockchain network ID
  entryPointAddress: '0x...',        // ERC-4337 EntryPoint contract address
  bundlerUrl: 'https://...',         // URL of the ERC-4337 bundler service
  factoryAddress: '0x...'            // Smart account factory contract address
};
```

#### Configuration Parameters

- **chainId**: The blockchain network identifier (e.g., 1 for Ethereum mainnet, 11690 for custom networks)
- **entryPointAddress**: The address of the ERC-4337 EntryPoint contract that handles UserOperations
- **bundlerUrl**: The HTTP endpoint of the bundler service that processes and submits UserOperations
- **factoryAddress**: The address of the factory contract that creates smart contract accounts

### Creating an EOA-based Account Abstraction Provider

An EOA (Externally Owned Account) provider wraps existing wallet providers like MetaMask, WalletConnect, or any other Ethereum wallet to work with Account Abstraction. This allows users to leverage their existing wallets while gaining the benefits of smart contract accounts.

The EOA provider:
- Uses your existing wallet's signing capabilities
- Converts regular transactions into UserOperations
- Handles gas estimation and payment through the smart contract account
- Maintains compatibility with existing wallet interfaces

```javascript
import { ethers } from 'ethers';
import { getEoaProvider } from 'ui-sdk';

const createEoaProvider = async () => {
  // You can use any base provider - MetaMask, WalletConnect, etc.
  const baseProvider = new ethers.providers.Web3Provider(window.ethereum);
  
  // Request account access if needed
  await window.ethereum.request({ method: 'eth_requestAccounts' });

  const config = {
    chainId: await baseProvider.getNetwork().then((net) => net.chainId),
    entryPointAddress: process.env.REACT_APP_ENTRY_POINT_ADDRESS,
    bundlerUrl: process.env.REACT_APP_BUNDLER_URL,
    factoryAddress: process.env.REACT_APP_ACCOUNT_FACTORY_ADDRESS
  };

  // Create the AA provider using the EOA provider
  const aaProvider = await getEoaProvider(baseProvider, config);
  
  return aaProvider;
};

// Example with WalletConnect
const createWalletConnectProvider = async () => {
  // Initialize WalletConnect provider
  const walletConnectProvider = new WalletConnectProvider({
    infuraId: "your-infura-id"
  });
  
  await walletConnectProvider.enable();
  const baseProvider = new ethers.providers.Web3Provider(walletConnectProvider);
  
  // Use the same getEoaProvider function
  const aaProvider = await getEoaProvider(baseProvider, config);
  
  return aaProvider;
};
```

### Creating a Passkey-based Account Abstraction Provider

A passkey provider enables passwordless authentication using WebAuthn (passkeys). This approach eliminates the need for traditional wallets and provides a more secure, user-friendly experience.

The passkey provider:
- Uses biometric authentication (fingerprint, face recognition, or PIN)
- Stores cryptographic keys securely in the device's hardware
- Provides cross-platform compatibility
- Enables seamless user experience without browser extensions

```javascript
import { ethers } from 'ethers';
import { getPasskeyProvider, WebAuthnPublicKey } from 'ui-sdk';

const createPasskeyProvider = async (credential) => {
  // Create a base provider using StaticJsonRpcProvider
  const baseProvider = new ethers.providers.StaticJsonRpcProvider(
    process.env.REACT_APP_RPC_URL
  );

  const config = {
    chainId: 11690, // Your network chain ID
    entryPointAddress: process.env.REACT_APP_ENTRY_POINT_ADDRESS,
    bundlerUrl: process.env.REACT_APP_BUNDLER_URL,
    factoryAddress: process.env.REACT_APP_ACCOUNT_FACTORY_ADDRESS
  };

  // Create the AA provider using the passkey provider
  const aaProvider = await getPasskeyProvider(baseProvider, credential, config);
  
  return aaProvider;
};
```

#### WebAuthnCredential Type

The `WebAuthnCredential` object contains the passkey information needed to create a provider:

```javascript
import { WebAuthnCredential } from 'ui-sdk';

// WebAuthnCredential type structure:
// {
//   credentialId: string;        // Base64url encoded credential ID
//   publicKey: WebAuthnPublicKey; // WebAuthn public key object
// }
```

### Creating a Passkey Account

The passkey account creation process involves registration, server communication, and subsequent authentication. Here's the complete flow:

#### Step 1: Register the Passkey

```javascript
import { registerPasskey, WebAuthnPublicKey } from 'ui-sdk';

const registerNewPasskey = async (passkeyName, challenge, userId) => {
  try {
    // Register the passkey with WebAuthn
    const response = await registerPasskey(passkeyName, challenge, userId);
    
    // Extract credential ID from the response
    const credentialId = response.credential.id;
    
    // Create WebAuthnPublicKey from the attestation object
    const publicKey = await WebAuthnPublicKey.fromAttetationObject(
      response.credential.response.attestationObject
    );
    
    return {
      credentialId,
      publicKey,
      attestationObject: response.credential.response.attestationObject,
      signature: response.signature
    };
  } catch (error) {
    console.error('Passkey registration failed:', error);
    throw error;
  }
};
```

#### Step 2: Complete Registration Flow

The typical passkey registration and authentication flow works as follows:

```javascript
// Complete passkey registration flow
const completePasskeyRegistration = async (passkeyName) => {
  try {
    // 1. Get registration challenge from your server
    const challengeResponse = await fetch('/api/auth/register/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passkeyName })
    });
    
    const { challenge, userId } = await challengeResponse.json();
    
    // 2. Register the passkey
    const registrationResult = await registerNewPasskey(passkeyName, challenge, userId);
    
    // 3. Send attestation object to server for verification and storage
    const verificationResponse = await fetch('/api/auth/register/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credentialId: registrationResult.credentialId,
        attestationObject: registrationResult.attestationObject,
        signature: registrationResult.signature,
        publicKeyX: registrationResult.publicKey.getX('hex'),
        publicKeyY: registrationResult.publicKey.getY('hex')
      })
    });
    
    const verificationResult = await verificationResponse.json();
    
    if (verificationResult.success) {
      console.log('Passkey registration successful!');
      return registrationResult;
    } else {
      throw new Error('Server verification failed');
    }
  } catch (error) {
    console.error('Registration flow failed:', error);
    throw error;
  }
};
```

#### Step 3: Login with Passkey

```javascript
import { signPasskeyLoginChallenge } from 'ui-sdk';

const loginWithPasskey = async () => {
  try {
    // 1. Get login challenge from server
    const challengeResponse = await fetch('/api/auth/login/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const { challenge } = await challengeResponse.json();
    
    // 2. Sign the challenge with passkey
    const signatureResult = await signPasskeyLoginChallenge(challenge);
    
    // 3. Send signature to server for verification
    const loginResponse = await fetch('/api/auth/login/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        credentialId: signatureResult.credential.id,
        signature: signatureResult.signature
      })
    });
    
    const loginResult = await loginResponse.json();
    
    if (loginResult.success) {
      // 4. Get user's public key and credential ID from server
      const userDataResponse = await fetch('/api/user/passkey-data', {
        headers: { 'Authorization': `Bearer ${loginResult.token}` }
      });
      
      const userData = await userDataResponse.json();
      
      // 5. Create WebAuthnPublicKey from server data
      const publicKey = WebAuthnPublicKey.fromCoordinates(
        userData.publicKeyX,
        userData.publicKeyY,
        'hex'
      );
      
      // 6. Create credential object for provider
      const credential = {
        credentialId: userData.credentialId,
        publicKey: publicKey
      };
      
      // 7. Create passkey provider
      const aaProvider = await createPasskeyProvider(credential);
      
      return aaProvider;
    } else {
      throw new Error('Login verification failed');
    }
  } catch (error) {
    console.error('Login flow failed:', error);
    throw error;
  }
};
```

#### Complete Example Usage

```javascript
// Registration flow
const handleRegister = async () => {
  const passkeyName = "My Wallet";
  const registrationResult = await completePasskeyRegistration(passkeyName);
  
  // Store credential locally for future use (optional)
  localStorage.setItem('passkeyCredential', JSON.stringify({
    credentialId: registrationResult.credentialId,
    publicKeyX: registrationResult.publicKey.getX('hex'),
    publicKeyY: registrationResult.publicKey.getY('hex')
  }));
  
  console.log('Passkey registered successfully!');
};

// Login flow
const handleLogin = async () => {
  const aaProvider = await loginWithPasskey();
  
  // Now you can use the provider for transactions
  const signer = aaProvider.getSigner();
  const address = await signer.getAddress();
  
  console.log('Smart account address:', address);
  return aaProvider;
};
```

#### Authentication Flow Summary

1. **Registration**: 
   - Call `registerPasskey()` with challenge from server
   - Extract `credentialId` and create `WebAuthnPublicKey` from attestation object
   - Send attestation data to server for verification and storage

2. **Login**:
   - Sign login challenge using `signPasskeyLoginChallenge()`
   - Send signature to server for verification
   - Retrieve public key and credential ID from server
   - Create `WebAuthnCredential` object and initialize provider

3. **Usage**:
   - Use the created provider for all Account Abstraction operations
   - The provider handles WebAuthn signing automatically for transactions

This approach provides a seamless, secure authentication experience while maintaining the full capabilities of Account Abstraction.

## Transaction Operations

### Single Transactions

The UI-SDK allows sending transactions through Account Abstraction, which means transactions are executed by a smart contract wallet rather than an EOA.

Key features of AA transactions:
- Gas is paid by the smart contract wallet
- Multiple operations can be batched
- Custom validation logic can be implemented
- Transactions can be sponsored by paymasters

```javascript
const sendTransaction = async (provider, to, value, data = '0x') => {
  try {
    const signer = provider.getSigner();

    // Get current gas price for optimal transaction execution
    const feeData = await provider.getFeeData();

    // Prepare transaction with gas optimization
    const tx = {
      to,
      value: ethers.utils.parseEther(value),
      data,
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
    };

    // Send transaction through AA
    const txResponse = await signer.sendTransaction(tx);

    // Wait for confirmation with 1 block and 60-second timeout
    await provider.waitForTransaction(txResponse.hash, 1, 60000);

    return txResponse;
  } catch (error) {
    console.error('Transaction error:', error);
    throw error;
  }
};
```

### Batch Transactions

Batch transactions are a powerful feature of Account Abstraction that allows multiple operations to be executed in a single transaction. This can significantly reduce gas costs and improve UX.

Benefits of batch transactions:
- Atomic execution (all operations succeed or all fail)
- Reduced gas costs compared to individual transactions
- Better UX with single signature for multiple operations
- Simplified error handling

```javascript
const sendBatchTransaction = async (provider, transactions) => {
  try {
    const signer = provider.getSigner();

    // Get current gas price
    const feeData = await provider.getFeeData();

    // Prepare batch transaction
    const batchTx = {
      targets: transactions.map(tx => tx.to),
      values: transactions.map(tx => tx.value),
      datas: transactions.map(tx => tx.data || '0x'),
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
    };

    // Execute batch transaction
    const txResponse = await signer.sendBatchTransaction(batchTx);
    await provider.waitForTransaction(txResponse.hash, 1, 60000);

    return txResponse;
  } catch (error) {
    console.error('Batch transaction error:', error);
    throw error;
  }
};

// Example usage of batch transaction
const batchExample = async (provider) => {
  const transactions = [
    {
      to: "0x123...",
      value: ethers.utils.parseEther("1.0"),
      data: "0x"
    },
    {
      to: "0x456...",
      value: ethers.utils.parseEther("0.5"),
      data: someContract.interface.encodeFunctionData("someFunction", [args])
    }
  ];

  return await sendBatchTransaction(provider, transactions);
};
```

### Contract Deployment

The UI-SDK provides a powerful contract deployment system that uses CREATE2 for deterministic addresses and supports both ContractFactory and raw bytecode deployments. All deployments are handled through Account Abstraction, ensuring consistent gas management and transaction handling.

Key features:
- Deterministic addresses using CREATE2
- Support for both ContractFactory and raw bytecode
- Address prediction before deployment
- Customizable salt for address generation
- Gas estimation utilities
- Full Account Abstraction integration

#### Address Prediction

One of the key features is the ability to predict the contract address before deployment:

```javascript
import { predictContractAddress, deployContract } from 'ui-sdk';

// Predict address before deployment
const predictedAddress = await predictContractAddress(aaProvider, {
  bytecode: contractBytecode,
  constructorArgs: [arg1, arg2]
}, customSalt); // Optional salt parameter

console.log('Contract will be deployed at:', predictedAddress);
```

#### Salt Parameter

The salt parameter is a unique value that determines the deployed contract's address when using CREATE2. It allows for:
- Deterministic address generation
- Multiple deployments of the same contract with different addresses
- Address reservation and planning
- Cross-chain deployment coordination

If not provided, a default salt is used: `0x0000000000000000000000000000000000000000000000000000000000000001`

```javascript
// Using custom salt for specific address generation
const customSalt = ethers.utils.id('my-unique-identifier'); // Creates a unique salt
const txHash = await deployContract(aaProvider, {
  bytecode: contractBytecode,
  constructorArgs: [arg1, arg2]
}, customSalt);
```

#### Deployment Methods

The UI-SDK supports two deployment methods:

1. Using ContractFactory:
```javascript
import { deployContract } from 'ui-sdk';

const factory = new ethers.ContractFactory(abi, bytecode, aaProvider.getSigner());
const txHash = await deployContract(aaProvider, factory);

// Optional: wait for deployment
await aaProvider.waitForTransaction(txHash);
const contract = new ethers.Contract(
  predictedAddress, // Use the predicted address
  abi,
  aaProvider.getSigner()
);
```

2. Using Raw Bytecode:
```javascript
const txHash = await deployContract(aaProvider, {
  bytecode: contractBytecode,
  constructorArgs: [arg1, arg2]
});

// Optional: wait for deployment
await aaProvider.waitForTransaction(txHash);
```

#### Gas Estimation

Before deployment, you can estimate the gas cost:

```javascript
import { estimateDeploymentGas } from 'ui-sdk';

const gasEstimate = await estimateDeploymentGas(aaProvider, {
  bytecode: contractBytecode,
  constructorArgs: [arg1, arg2]
});

console.log('Deployment will cost approximately:', gasEstimate.toString());

// Use the estimate for deployment
const txHash = await deployContract(aaProvider, {
  bytecode: contractBytecode,
  constructorArgs: [arg1, arg2]
}, undefined, // Use default salt
   undefined, // Use default deployer
   { gasLimit: gasEstimate }
);
```

#### Deployment Considerations

- **Address Prediction**: Always predict the address before deployment to ensure it matches your expectations
- **Salt Management**: Use meaningful salts for better deployment organization and address tracking
- **Gas Estimation**: Estimate gas costs before deployment, especially for contracts with complex constructors
- **Cross-chain Deployment**: The same salt will generate the same address across different chains
- **Verification**: After deployment, verify that the deployed bytecode matches your expectations

## Gas Management

### Gas Estimation

Gas estimation in Account Abstraction is more complex than traditional transactions because it involves multiple components:

1. **Call Gas**: Gas used by the actual operation
2. **Verification Gas**: Gas used for signature verification and validation
3. **Pre-verification Gas**: Gas used for bundler operations

```javascript
const estimateGas = async (provider, to, value, data = '0x') => {
  const smartAccountAPI = provider.smartAccountAPI;

  try {
    // Encode the transaction data for gas estimation
    const encoding = await smartAccountAPI.encodeUserOpCallDataAndGasLimit({
      target: to,
      data,
      value: ethers.utils.parseEther(value)
    });

    // Get the UserOperation parameters
    const sender = await smartAccountAPI.getAccountAddress();
    const nonce = await smartAccountAPI.getNonce();
    const initCode = await smartAccountAPI.getInitCode();

    // Get complete gas estimation
    const estimation = await provider.httpRpcClient.estimateUserOpGas({
      sender,
      nonce,
      initCode,
      callData: encoding.callData,
      callGasLimit: 0,
      verificationGasLimit: 0,
      maxFeePerGas: 0,
      maxPriorityFeePerGas: 0,
      paymasterAndData: '0x',
      signature: '0x'
    });

    // Calculate total gas and return detailed breakdown
    return {
      callGasLimit: estimation.callGasLimit,
      verificationGas: estimation.verificationGas,
      preVerificationGas: estimation.preVerificationGas,
      totalGas: Number(estimation.verificationGas) +
                Number(estimation.callGasLimit) +
                Number(estimation.preVerificationGas)
    };
  } catch (error) {
    console.error('Gas estimation error:', error);
    throw error;
  }
};
```

### Gas Price Management

The UI-SDK provides methods to fetch and manage gas prices for optimal transaction execution:

```javascript
const getGasPrice = async (provider) => {
  try {
    const feeData = await provider.getFeeData();

    // Return comprehensive fee data
    return {
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      gasPrice: feeData.gasPrice,
      // Convert to human-readable format
      formatted: {
        maxFeePerGas: ethers.utils.formatUnits(feeData.maxFeePerGas, 'gwei'),
        maxPriorityFeePerGas: ethers.utils.formatUnits(feeData.maxPriorityFeePerGas, 'gwei'),
        gasPrice: ethers.utils.formatUnits(feeData.gasPrice, 'gwei')
      }
    };
  } catch (error) {
    console.error('Error fetching gas price:', error);
    throw error;
  }
};

// Example of gas price optimization
const optimizeGasPrice = async (provider) => {
  const feeData = await getGasPrice(provider);

  // Add 20% to priority fee for faster inclusion
  const optimizedPriorityFee = feeData.maxPriorityFeePerGas.mul(120).div(100);

  return {
    maxFeePerGas: feeData.maxFeePerGas,
    maxPriorityFeePerGas: optimizedPriorityFee
  };
};
```

## Basic Interactions

Common ethers.js interactions through AA provider:

```javascript
// Get wallet address
const getAddress = async (provider) => {
  const signer = provider.getSigner();
  return await signer.getAddress();
};

// Get balance
const getBalance = async (provider, address) => {
  const balance = await provider.getBalance(address);
  return ethers.utils.formatEther(balance);
};

// Contract interaction
const interactWithContract = async (provider, contractAddress, abi) => {
  try {
    const contract = new ethers.Contract(
      contractAddress,
      abi,
      provider.getSigner()
    );

    // Example read operation
    const value = await contract.someReadMethod();

    // Example write operation with gas estimation
    const feeData = await provider.getFeeData();
    const tx = await contract.someWriteMethod(params, {
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
    });

    await tx.wait();
    return tx;
  } catch (error) {
    console.error('Contract interaction error:', error);
    throw error;
  }
};
```

Note: Replace environment variables and placeholder values with your actual configuration. Always ensure proper error handling and input validation in production code.
