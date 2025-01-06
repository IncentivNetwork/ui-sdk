/**
 * Type guard to check if an object has a publicKey property with x and y coordinates
 */
export function hasPublicKey(owner: any): owner is { publicKey: { x: string; y: string } } {
  return (
    owner != null &&
    typeof owner === 'object' &&
    'publicKey' in owner &&
    typeof owner.publicKey === 'object' &&
    owner.publicKey != null &&
    'x' in owner.publicKey &&
    'y' in owner.publicKey &&
    typeof owner.publicKey.x === 'string' &&
    typeof owner.publicKey.y === 'string'
  )
}