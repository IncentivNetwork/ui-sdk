import { ethers } from 'ethers';
import { wrapProvider } from './Provider';
import { parseDerSignature } from './utils/WebAuthnService';
import { ClientConfig } from './ClientConfig';
import base64url from 'base64url';
import WebAuthnPublicKey from './utils/WebAuthnPublicKey';

export type WebAuthnCredential = {
  credentialId: string;
  publicKey: WebAuthnPublicKey;
};

export const getPasskeyProvider = async (
  baseProvider: any,
  credential: WebAuthnCredential,
  config: ClientConfig,
) => {
  const allowCredentials: PublicKeyCredentialDescriptor[] = [
    {
      id: base64url.toBuffer(credential.credentialId).buffer as BufferSource,
      type: 'public-key',
    },
  ];

  // Initialize the passkey signer
  const passkeySigner: any = {
    async signTransaction(tx: any) {
      throw new Error('signTransaction not implemented.');
    },
    async signMessage(message: any) {
      try {
        // Use message as the challenge in WebAuthn
        const challenge = message;

        // Prepare WebAuthn assertion options
        const publicKeyCredentialRequestOptions: CredentialRequestOptions = {
          publicKey: {
            challenge,
            rpId: window.location.hostname,
            userVerification: 'required',
            allowCredentials,
            timeout: 60000,
          },
        };

        // Get the assertion from WebAuthn
        const assertion: any = await navigator.credentials.get(
          publicKeyCredentialRequestOptions,
        );

        // Extract necessary components
        const authenticatorData = new Uint8Array(
          assertion.response.authenticatorData,
        );
        const clientDataJSON = new Uint8Array(
          assertion.response.clientDataJSON,
        );
        const signatureDER = new Uint8Array(assertion.response.signature);

        // Parse r and s from DER-encoded signature
        const { r, s } = parseDerSignature(signatureDER);

        // Find locations in clientDataJSON
        const clientDataString = new TextDecoder().decode(clientDataJSON);

        // Encode the challenge as base64url for comparison
        const challengeBase64Url = base64url.encode(challenge);
        const challengeProperty = `"challenge":"${challengeBase64Url}"`;
        const challengeLocation = clientDataString.indexOf(challengeProperty);
        const responseType = '"type":"webauthn.get"';
        const responseTypeLocation = clientDataString.indexOf(responseType);

        // Define the Signature struct as a tuple
        const signatureType = {
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
        };

        // Prepare the signature data as an object
        const signatureStruct = {
          authenticatorData: authenticatorData,
          clientDataJSON: clientDataString,
          challengeLocation: challengeLocation,
          responseTypeLocation: responseTypeLocation,
          r: ethers.BigNumber.from(r),
          s: ethers.BigNumber.from(s),
          publicKeyX: `0x${credential.publicKey.getX('hex')}`,
          publicKeyY: `0x${credential.publicKey.getY('hex')}`,
        };

        // Encode the Signature struct
        const encodedSignature = ethers.utils.defaultAbiCoder.encode(
          [signatureType as ethers.utils.ParamType],
          [signatureStruct],
        );

        return encodedSignature;
      } catch (error) {
        console.error('Error during signMessage:', error);
        throw new Error('Passkey signMessage failed.');
      }
    },
    async signUserOp(userOp: any) {
      throw new Error('signUserOp not implemented.');
    },
    getAddress: async () => {
      return '0x';
    },
    publicKey: {
      x: '0x' + credential.publicKey.getX('hex'),
      y: '0x' + credential.publicKey.getY('hex'),
    },
  };

  // Wrap the provider with Account Abstraction
  const aaProvider = await wrapProvider(
    baseProvider,
    config as any,
    passkeySigner,
  );

  return aaProvider;
};
