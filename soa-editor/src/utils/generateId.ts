// Utility to generate a URL-friendly slug based on a name
export function generateSlug(name: string) {
  if (!name) return '';
  // slugify: lowercase, trim, replace non-alphanumeric with hyphens, collapse repeats
  return name
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

// Backwards-compat: keep generateId but redirect to slug behavior if still imported elsewhere
export function generateId(_type: string, name: string) {
  return generateSlug(name);
}

// Lightweight ULID generator (no external deps)
// ULID format: 26-char Crockford Base32, time component (10) + randomness (16)
const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encodeTime(time: number, len: number) {
  let str = '';
  for (let i = len - 1; i >= 0; i--) {
    const mod = time % 32;
    str = ENCODING[mod] + str;
    time = Math.floor(time / 32);
  }
  return str;
}

function encodeRandom(len: number) {
  let str = '';
  for (let i = 0; i < len; i++) {
    const rand = Math.floor(Math.random() * 32);
    str += ENCODING[rand];
  }
  return str;
}

export function generateUlid(date: Date = new Date()) {
  const time = date.getTime();
  return encodeTime(time, 10) + encodeRandom(16);
}
