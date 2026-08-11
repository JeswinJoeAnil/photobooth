/**
 * Generates a short, human-friendly room code.
 * Uppercase alphanumeric (no ambiguous chars: 0/O, 1/I/L).
 * Example output: "M7K2QX"
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateRoomCode(length = 6) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => ALPHABET[byte % ALPHABET.length]).join('');
}

/**
 * Validates that a string looks like a valid room code.
 */
export function isValidRoomCode(code) {
  if (!code || typeof code !== 'string') return false;
  const cleaned = code.trim().toUpperCase();
  return cleaned.length === 6 && /^[A-Z0-9]+$/.test(cleaned);
}

/**
 * Normalizes user input to a clean room code.
 */
export function normalizeRoomCode(input) {
  if (!input || typeof input !== 'string') return '';
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}
