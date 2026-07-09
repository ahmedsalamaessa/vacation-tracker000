/**
 * SHA-256 Hashing for password security
 * Uses Web Crypto API - no external dependencies
 */

let _encoder: TextEncoder | null = null;

function getEncoder(): TextEncoder {
  if (!_encoder) _encoder = new TextEncoder();
  return _encoder;
}

/**
 * Hash a string using SHA-256
 * Returns hex string
 */
export async function sha256(text: string): Promise<string> {
  if (!text) return '';
  const encoder = getEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Synchronous fallback for non-async contexts
 * Uses a simple hash (NOT cryptographically secure)
 * Only used when async is impossible
 */
export function simpleHash(text: string): string {
  if (!text) return '';
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return 's' + Math.abs(hash).toString(36) + text.length.toString(36);
}
