import { wrapProvider } from './Provider';
import { ClientConfig } from './ClientConfig';

export const getEoaProvider = async (baseProvider: any, config: ClientConfig) => {
  const signer = baseProvider.getSigner();

  // Wrap the provider with Account Abstraction
  const aaProvider = await wrapProvider(baseProvider, config, signer);

  // Validate the wrapped provider
  if (!aaProvider.getSigner()) {
    throw new Error('Failed to initialize the Account Abstraction provider.');
  }

  return aaProvider;
};

export const signLoginChallenge = async (provider: any, challenge: string) => {
  const signer = provider.getSigner();
  return signer.signMessage(challenge);
};
