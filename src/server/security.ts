// Mots de passe (scrypt), jetons aléatoires et signatures HMAC.
import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { config } from './config';

/** Coût du hachage des nouveaux mots de passe. Chaque hachage garde le sien (`scrypt$N$sel$clé`) : en changer N ne
 * rend aucun mot de passe existant invalide (verifyPassword lit N dans le hachage, needsRehash le signale). */
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
/** Plus grand N accepté d'un hachage stocké (au-delà : refus, plutôt qu'un calcul de plusieurs gigaoctets). */
const MAX_N = 2 ** 20;

function scryptAsync(password: string, salt: Buffer, N: number = SCRYPT.N): Promise<Buffer> {
  // Mémoire nécessaire : 128 × N × r octets ; on garde de la marge au-delà du coût courant.
  const opts = { ...SCRYPT, N, maxmem: Math.max(SCRYPT.maxmem, 256 * N * SCRYPT.r) };
  return new Promise((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, 64, opts, (err, key) => (err ? reject(err) : resolve(key))));
}

/** N d'un hachage stocké, ou null s'il n'est pas une puissance de 2 raisonnable. */
function storedN(n: string | undefined): number | null {
  const N = Number(n);
  return Number.isInteger(N) && N >= 2 && N <= MAX_N && (N & (N - 1)) === 0 ? N : null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt);
  return `scrypt$${SCRYPT.N}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/** Vérifie un mot de passe contre son hachage, avec le coût (N) de ce hachage. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, saltB64, keyB64] = stored.split('$');
  const N = storedN(n);
  if (algo !== 'scrypt' || !N || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scryptAsync(password, Buffer.from(saltB64, 'base64'), N);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Le hachage a-t-il été fait avec un coût plus faible que le coût courant ? (à refaire à la prochaine connexion) */
export function needsRehash(stored: string): boolean {
  const [algo, n] = stored.split('$');
  const N = storedN(n);
  return algo === 'scrypt' && N !== null && N < SCRYPT.N;
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function sign(value: string): string {
  const mac = createHmac('sha256', config.secret).update(value).digest('base64url').slice(0, 32);
  return `${value}.${mac}`;
}

export function unsign(signed: string | undefined): string | null {
  if (!signed) return null;
  const i = signed.lastIndexOf('.');
  if (i < 0) return null;
  const value = signed.slice(0, i);
  const a = Buffer.from(sign(value));
  const b = Buffer.from(signed);
  return a.length === b.length && timingSafeEqual(a, b) ? value : null;
}

/** Identifiant court et lisible pour les parties (liens d'invitation). */
export function gameId(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(10);
  let s = '';
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s;
}
