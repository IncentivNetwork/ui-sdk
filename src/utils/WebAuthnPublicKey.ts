import base64url from 'base64url';
import cbor from 'cbor';

class WebAuthnPublicKey {
  private x: Buffer;
  private y: Buffer;

  constructor(x: Buffer, y: Buffer) {
    if (x.length < 32) {
      const padding = Buffer.alloc(32 - x.length, 0);
      x = Buffer.concat([Uint8Array.from(padding), Uint8Array.from(x)]);
    }

    if (y.length < 32) {
      const padding = Buffer.alloc(32 - y.length, 0);
      y = Buffer.concat([Uint8Array.from(padding), Uint8Array.from(y)]);
    }

    this.x = x;
    this.y = y;
  }

  static parse(publicKey: string) {
    const [x, y] = publicKey.split('.');
    return new WebAuthnPublicKey(base64url.toBuffer(x), base64url.toBuffer(y));
  }

  static fromCoordinates(x: string, y: string, encoding?: BufferEncoding) {
    return new WebAuthnPublicKey(
      Buffer.from(x, encoding),
      Buffer.from(y, encoding),
    );
  }

  static async fromAttetationObject(attestationObjectBuffer: Buffer | string) {
    if (typeof attestationObjectBuffer === 'string') {
      attestationObjectBuffer = base64url.toBuffer(attestationObjectBuffer);
    }

    const attestationObject = await cbor.decodeFirst(attestationObjectBuffer);
    const authData = new Uint8Array(attestationObject.authData);

    // Skip the RP ID hash
    let pointer = 32;

    // Get flags
    const flagsBuf = authData.slice(pointer, ++pointer);
    const flags = flagsBuf[0];
    const attestedCredentialDataFlag = (flags & 0x40) !== 0;

    if (attestedCredentialDataFlag) {
      // Skip Sign count (4 bytes) and AAGUID (16 bytes)
      pointer += 4 + 16;

      // Get credential ID Length (2 bytes)
      const credIdLenBuf = authData.slice(pointer, (pointer += 2));
      const credIdLen = new DataView(credIdLenBuf.buffer).getUint16(0, false);

      // Skip Credential ID (credIdLen bytes)
      pointer += credIdLen;

      // Get Public Key (variable length)
      const publicKeyBytes = authData.slice(pointer);

      // Decode the public key using CBOR
      const publicKeyObject = await cbor.decodeFirst(publicKeyBytes.buffer);

      // Extract x and y coordinates using integer keys
      const x = publicKeyObject.get(-2);
      const y = publicKeyObject.get(-3);

      if (!x || !y) {
        throw new Error('Public key coordinates are missing.');
      }

      return new WebAuthnPublicKey(Buffer.from(x), Buffer.from(y));
    } else {
      throw new Error('Attested credential data flag is missing.');
    }
  }

  getX(encoding?: BufferEncoding) {
    return this.x.toString(encoding);
  }

  getY(encoding?: BufferEncoding) {
    return this.y.toString(encoding);
  }

  toCose() {
    return cbor.encode(
      new Map<number, any>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, this.x],
        [-3, this.y],
      ]),
    );
  }

  toString() {
    const encodedX = base64url.encode(this.x);
    const encodedY = base64url.encode(this.y);
    return `${encodedX}.${encodedY}`;
  }
}

export default WebAuthnPublicKey;
