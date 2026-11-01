import { createHash } from 'node:crypto';
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Public, stable display ID. Keep the original machine binding for existing keys. */
export function displayDeviceId(machineId: string): string {
  const bytes = createHash('sha256').update('HomescapesDeviceDisplay:' + machineId).digest();
  const text = Array.from(bytes.subarray(0, 20), b => alphabet[b & 31]).join('');
  return 'VIP-' + text.match(/.{4}/g)!.join('-');
}
