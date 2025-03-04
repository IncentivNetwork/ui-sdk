# UI-SDK Documentation Guide

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

UI-SDK is a powerful library that enables Account Abstraction (AA) capabilities in web applications by providing a streamlined interface for communicating with ERC-4337 bundlers. It supports both EOA (Externally Owned Account) and Passkey-based authentication methods for creating AA wallets.

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
npm install ui-sdk ethers@5.7.2 base64url cbor elliptic bn.js js-sha256
# or
yarn add ui-sdk ethers@5.7.2 base64url cbor elliptic bn.js js-sha256
```

## Account Abstraction Providers

### Creating an EOA-based Account Abstraction Provider

To use the UI-SDK with an existing Externally Owned Account (EOA) like MetaMask, you'll need to create an Account Abstraction provider that wraps your EOA. This allows your regular wallet to interact with the Account Abstraction system. Here's how to set it up:

```javascript
import { ethers } from 'ethers';
import { wrapProvider } from 'ui-sdk';

const getAAProvider = async () => {
  // Initialize provider with MetaMask
  const provider = new ethers.providers.Web3Provider(window.ethereum);

  // Request account access if needed
  await window.ethereum.request({ method: 'eth_requestAccounts' });

  const signer = provider.getSigner();

  // Configuration for AA Provider
  const config = {
    chainId: await provider.getNetwork().then((net) => net.chainId),
    entryPointAddress: process.env.REACT_APP_ENTRY_POINT_ADDRESS,
    bundlerUrl: process.env.REACT_APP_BUNDLER_URL,
    factoryAddress: process.env.REACT_APP_ACCOUNT_FACTORY_ADDRESS,
    factoryManagerAddress: process.env.REACT_APP_FACTORY_MANAGER_ADDRESS
  };

  // Validate configuration
  if (!config.entryPointAddress || !config.bundlerUrl ||
      (!config.factoryAddress && !config.factoryManagerAddress)) {
    throw new Error('Missing required configuration parameters');
  }

  // Create and return the AA provider
  const aaProvider = await wrapProvider(provider, config, signer);

  if (!aaProvider.getSigner()) {
    throw new Error('Failed to initialize the Account Abstraction provider');
  }

  return aaProvider;
};

Note: If MetaMask is not detected, you should handle this case by either:
- Prompting the user to install MetaMask
- Falling back to a different authentication method
- Providing a link to MetaMask installation

### Creating a Passkey-based Account Abstraction Provider

Passkeys provide a secure, passwordless way to create and manage Account Abstraction wallets. Setting up a passkey-based provider involves three steps: registration, authentication, and signer implementation. Here's a complete guide to implementing each component:

#### Passkey Registration

```javascript
import base64url from 'base64url';

export const registerPasskey = async (passkeyName) => {
  // Generate random challenge
  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);

  // Configure WebAuthn credential creation
  const publicKeyCredentialCreationOptions = {
    publicKey: {
      challenge,
      rp: {
        name: 'Your Wallet Name',
        id: window.location.hostname,
      },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: passkeyName,
        displayName: passkeyName,
      },
      pubKeyCredParams: [{ alg: -7, type: 'public-key' }], // P-256 algorithm
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
      },
      timeout: 60000,
      attestation: 'direct',
    },
  };

  // Create credential
  const credential = await navigator.credentials.create(
    publicKeyCredentialCreationOptions
  );

  // Extract public key and store passkey
  const publicKey = await extractPublicKeyFromAttestation(
    credential.response.attestationObject
  );

  // Store passkey information
  const credentialId = base64url.encode(new Uint8Array(credential.rawId));
  const newPasskey = {
    id: credentialId,
    name: passkeyName,
    publicKey,
    createdAt: new Date().toISOString()
  };

  // Save to local storage
  const existingPasskeys = JSON.parse(localStorage.getItem('passkeys') || '[]');
  existingPasskeys.push(newPasskey);
  localStorage.setItem('passkeys', JSON.stringify(existingPasskeys));
  localStorage.setItem('currentPasskey', credentialId);

  return { credential, publicKey };
};
```

#### Passkey Authentication

```javascript
export const loginWithPasskey = async () => {
  // Generate challenge for authentication
  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);

  // Configure WebAuthn assertion options
  const publicKeyCredentialRequestOptions = {
    publicKey: {
      challenge,
      rpId: window.location.hostname,
      userVerification: 'required',
      timeout: 60000,
      allowCredentials: [], // Empty to show all available passkeys
    },
  };

  // Get assertion
  const assertion = await navigator.credentials.get(publicKeyCredentialRequestOptions);
  const credentialId = base64url.encode(new Uint8Array(assertion.rawId));

  // Verify existing passkey
  const existingPasskeys = JSON.parse(localStorage.getItem('passkeys') || '[]');
  const existingPasskey = existingPasskeys.find(pk => pk.id === credentialId);

  if (existingPasskey) {
    localStorage.setItem('currentPasskey', credentialId);
    return { publicKey: existingPasskey.publicKey };
  }

  // For new passkeys, implement key recovery process
  // ... (implement key recovery if needed)
};
```

#### Passkey Signer Implementation

```javascript
import { ethers } from 'ethers';
import base64url from 'base64url';

export const initializePasskeySigner = async () => {
  // Get current passkey
  const passkeys = JSON.parse(localStorage.getItem('passkeys') || '[]');
  const currentPasskeyId = localStorage.getItem('currentPasskey');

  if (!currentPasskeyId || !passkeys.length) {
    throw new Error('No passkeys found. Please register or login first.');
  }

  const currentPasskey = passkeys.find(pk => pk.id === currentPasskeyId);
  if (!currentPasskey) {
    throw new Error('Selected passkey not found.');
  }

  // Convert public key coordinates to hex
  const xHex = '0x' + Buffer.from(base64url.toBuffer(currentPasskey.publicKey.x))
    .toString('hex')
    .padStart(64, '0');
  const yHex = '0x' + Buffer.from(base64url.toBuffer(currentPasskey.publicKey.y))
    .toString('hex')
    .padStart(64, '0');

  // Create passkey signer
  const passkeySigner = {
    async signMessage(message) {
      const challenge = message;
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          rpId: window.location.hostname,
          userVerification: 'required',
          allowCredentials: [{
            id: base64url.toBuffer(currentPasskeyId).buffer,
            type: 'public-key',
          }],
          timeout: 60000,
        },
      });

      // Process WebAuthn response
      const authenticatorData = new Uint8Array(assertion.response.authenticatorData);
      const clientDataJSON = new Uint8Array(assertion.response.clientDataJSON);
      const signatureDER = new Uint8Array(assertion.response.signature);
      const { r, s } = parseDerSignature(signatureDER);

      // Create signature struct
      const signatureStruct = {
        authenticatorData,
        clientDataJSON: new TextDecoder().decode(clientDataJSON),
        challengeLocation: clientDataJSON.indexOf('"challenge"'),
        responseTypeLocation: clientDataJSON.indexOf('"type"'),
        r: ethers.BigNumber.from(r),
        s: ethers.BigNumber.from(s),
        publicKeyX: xHex,
        publicKeyY: yHex
      };

      // Encode signature
      return ethers.utils.defaultAbiCoder.encode(
        [{
          components: [
            { name: 'authenticatorData', type: 'bytes' },
            { name: 'clientDataJSON', type: 'string' },
            { name: 'challengeLocation', type: 'uint256' },
            { name: 'responseTypeLocation', type: 'uint256' },
            { name: 'r', type: 'uint256' },
            { name: 's', type: 'uint256' },
            { name: 'publicKeyX', type: 'uint256' },
            { name: 'publicKeyY', type: 'uint256' }
          ],
          name: 'Signature',
          type: 'tuple',
        }],
        [signatureStruct]
      );
    },
    getAddress: async () => '0x', // Address will be derived by the AA provider
    publicKey: { x: xHex, y: yHex }
  };

  return passkeySigner;
};
```

### Creating the Passkey AA Provider

```javascript
import { wrapProvider } from 'ui-sdk';

const getAAPasskeyProvider = async () => {
  // Initialize the passkey signer
  const passkeySigner = await initializePasskeySigner();

  const config = {
    chainId: 11690, // Replace with your chain ID
    entryPointAddress: process.env.REACT_APP_ENTRY_POINT_ADDRESS,
    bundlerUrl: process.env.REACT_APP_BUNDLER_URL,
    factoryAddress: process.env.REACT_APP_ACCOUNT_FACTORY_ADDRESS,
    factoryManagerAddress: process.env.REACT_APP_FACTORY_MANAGER_ADDRESS
  };

  const provider = new ethers.providers.JsonRpcProvider(process.env.REACT_APP_RPC_URL);
  return await wrapProvider(provider, config, passkeySigner);
};
```

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
