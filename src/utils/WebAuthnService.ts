import base64url from 'base64url';

export const registerPasskey = async (
  passkeyName: string,
  challenge: string,
  userId: string,
) => {
  const publicKeyCredentialCreationOptions: CredentialCreationOptions = {
    publicKey: {
      challenge: Uint8Array.from(base64url.toBuffer(challenge)),
      rp: {
        name: 'Incentiv Wallet',
        id: window.location.hostname,
      },
      user: {
        id: Uint8Array.from(base64url.toBuffer(userId)),
        name: passkeyName,
        displayName: passkeyName,
      },
      pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
      },
      timeout: 60000,
      attestation: 'direct',
    },
  };

  const credential: any = await navigator.credentials.create(
    publicKeyCredentialCreationOptions,
  );

  if (!credential || !credential.response)
    throw new Error('Failed to create credentials');

  const signatureObject = {
    id: credential.id,
    rawId: base64url.encode(credential.rawId),
    response: {
      clientDataJSON: base64url.encode(credential.response.clientDataJSON),
      attestationObject: base64url.encode(
        credential.response.attestationObject,
      ),
    },
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment,
    clientExtensionResults: credential.getClientExtensionResults(),
  };

  return {
    credential: signatureObject,
    signature: base64url.encode(JSON.stringify(signatureObject)),
  };
};

export const signPasskeyLoginChallenge = async (
  challenge: string,
  allowCredentials: string[] = [],
) => {
  const publicKeyCredentialRequestOptions: CredentialRequestOptions = {
    publicKey: {
      challenge: Uint8Array.from(base64url.toBuffer(challenge)),
      allowCredentials: allowCredentials.map((credential) => ({
        id: Uint8Array.from(base64url.toBuffer(credential)),
        type: 'public-key',
      })),
      timeout: 60000,
      userVerification: 'required',
    },
  };

  const credential: any = await navigator.credentials.get(
    publicKeyCredentialRequestOptions,
  );

  if (!credential || !credential.response)
    throw new Error('Failed to get credentials');

  const signatureObject = {
    id: credential.id,
    rawId: base64url.encode(credential.rawId),
    response: {
      clientDataJSON: base64url.encode(credential.response.clientDataJSON),
      authenticatorData: base64url.encode(
        credential.response.authenticatorData,
      ),
      signature: base64url.encode(credential.response.signature),
      userHandle: credential.response.userHandle
        ? base64url.encode(credential.response.userHandle)
        : undefined,
    },
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment,
    clientExtensionResults: credential.getClientExtensionResults(),
  };

  return {
    credential: signatureObject,
    signature: base64url.encode(JSON.stringify(signatureObject)),
  };
};

export const parseDerSignature = (derSignature: any) => {
  let offset = 0;

  if (derSignature[offset++] !== 0x30) {
    throw new Error('Invalid signature format');
  }

  const length = derSignature[offset++];
  if (length + 2 !== derSignature.length) {
    throw new Error('Invalid signature length');
  }

  if (derSignature[offset++] !== 0x02) {
    throw new Error('Invalid r marker');
  }

  let rLength = derSignature[offset++];
  let r = derSignature.slice(offset, offset + rLength);
  offset += rLength;

  if (derSignature[offset++] !== 0x02) {
    throw new Error('Invalid s marker');
  }

  let sLength = derSignature[offset++];
  let s = derSignature.slice(offset, offset + sLength);

  // Adjust r and s if they have leading zeros
  if (r[0] === 0x00) {
    r = r.slice(1);
  }
  if (s[0] === 0x00) {
    s = s.slice(1);
  }

  return { r, s };
};
