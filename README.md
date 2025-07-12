# UI-SDK

A TypeScript SDK that enables **Account Abstraction (ERC-4337)** capabilities in Incentiv Platform applications, providing a streamlined interface for creating smart contract wallets with enhanced security and user experience.

## What does UI-SDK do?

UI-SDK transforms how users interact with blockchain applications by enabling **smart contract wallets** instead of traditional Externally Owned Accounts (EOAs). This unlocks powerful features like:

- **Passwordless Authentication** with biometric passkeys
- **Batch Transactions** for improved efficiency
- **Gas Abstraction** and sponsored transactions
- **Account Recovery** mechanisms
- **Custom Security Policies** and spending limits
- **Multi-signature** requirements
- **Transaction Automation** and whitelisting

## Key Features

🔐 **Dual Authentication Methods**
- **EOA Provider**: Integrate with existing wallets (MetaMask, WalletConnect, etc.)
- **Passkey Provider**: Passwordless authentication using WebAuthn biometrics

⚡ **Seamless Integration**
- Drop-in replacement for standard ethers.js providers
- Compatible with existing dApps and smart contracts
- Full TypeScript support with comprehensive type definitions

🛡️ **Enhanced Security**
- Hardware-backed passkey storage
- Multi-layered signature validation
- Customizable security policies

## Quick Start

### Installation

```bash
npm install ui-sdk ethers@5.7.2
```

### EOA Provider (MetaMask, WalletConnect, etc.)

Transform your existing wallet into a smart contract wallet:

```typescript
import { ethers } from 'ethers';
import { getEoaProvider } from 'ui-sdk';

// Works with any existing provider
const baseProvider = new ethers.providers.Web3Provider(window.ethereum);
await window.ethereum.request({ method: 'eth_requestAccounts' });

const config = {
  chainId: 1,
  entryPointAddress: '0x...',
  bundlerUrl: 'https://...',
  factoryAddress: '0x...'
};

const aaProvider = await getEoaProvider(baseProvider, config);

// Use like any ethers provider
const signer = aaProvider.getSigner();
const address = await signer.getAddress();
```

### Passkey Provider (Biometric Authentication)

Create a passwordless wallet experience:

```typescript
import { ethers } from 'ethers';
import { getPasskeyProvider, registerPasskey, WebAuthnPublicKey } from 'ui-sdk';

// 1. Register a new passkey
const registrationResult = await registerPasskey(
  'My Wallet',
  challengeFromServer,
  userId
);

// 2. Extract public key
const publicKey = await WebAuthnPublicKey.fromAttetationObject(
  registrationResult.credential.response.attestationObject
);

// 3. Create provider
const baseProvider = new ethers.providers.StaticJsonRpcProvider(rpcUrl);
const credential = {
  credentialId: registrationResult.credential.id,
  publicKey: publicKey
};

const aaProvider = await getPasskeyProvider(baseProvider, credential, config);

// Use with biometric authentication
const signer = aaProvider.getSigner();
const tx = await signer.sendTransaction({
  to: '0x...',
  value: ethers.utils.parseEther('1.0')
});
```

## Advanced Features

### Batch Transactions

Execute multiple operations in a single transaction:

```typescript
const transactions = [
  { to: '0x123...', value: ethers.utils.parseEther('1.0') },
  { to: '0x456...', value: ethers.utils.parseEther('0.5') }
];

const txResponse = await signer.sendBatchTransaction({
  targets: transactions.map(tx => tx.to),
  values: transactions.map(tx => tx.value),
  datas: transactions.map(tx => tx.data || '0x')
});
```

### Contract Deployment

Deploy contracts with deterministic addresses:

```typescript
import { deployContract, predictContractAddress } from 'ui-sdk';

// Predict address before deployment
const predictedAddress = await predictContractAddress(aaProvider, {
  bytecode: contractBytecode,
  constructorArgs: [arg1, arg2]
});

// Deploy the contract
const txHash = await deployContract(aaProvider, {
  bytecode: contractBytecode,
  constructorArgs: [arg1, arg2]
});
```

### Gas Management

Optimized gas estimation and pricing:

```typescript
// Get detailed gas estimation
const gasEstimate = await estimateGas(provider, to, value, data);

// Get optimized gas prices
const feeData = await provider.getFeeData();
```

## Browser Compatibility

**EOA Provider**: All modern browsers with wallet extensions

**Passkey Provider**:
- Chrome/Edge: Version 67+
- Safari: Version 14+
- Firefox: Version 60+
- Mobile: iOS 15+ (Safari), Android 7+ (Chrome)

## Documentation

📚 **[Complete Implementation Guide](docs/UI-SDK-GUIDE.md)**

For detailed implementation instructions, configuration options, and advanced usage patterns, see our comprehensive guide:

- **[Configuration](docs/UI-SDK-GUIDE.md#configuration)** - Setup and configuration options
- **[EOA Provider Guide](docs/UI-SDK-GUIDE.md#creating-an-eoa-based-account-abstraction-provider)** - Integrate existing wallets
- **[Passkey Provider Guide](docs/UI-SDK-GUIDE.md#creating-a-passkey-based-account-abstraction-provider)** - Passwordless authentication
- **[Transaction Operations](docs/UI-SDK-GUIDE.md#transaction-operations)** - Single and batch transactions
- **[Contract Deployment](docs/UI-SDK-GUIDE.md#contract-deployment)** - Smart contract deployment
- **[Gas Management](docs/UI-SDK-GUIDE.md#gas-management)** - Gas estimation and optimization

## Examples

Check out our example implementations:

- **MetaMask Integration**: Standard EOA provider setup
- **WalletConnect Integration**: Multi-wallet support
- **Passkey Authentication**: Complete biometric authentication flow
- **Batch Operations**: Multiple transaction execution
- **Contract Deployment**: Deterministic contract addresses

## Support

For questions, issues, or contributions, please refer to our [documentation](docs/UI-SDK-GUIDE.md) or open an issue in this repository.

---

**UI-SDK** - Enabling the future of user-friendly blockchain interactions through Account Abstraction.
