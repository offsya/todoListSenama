import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

/*
 * Passwords are hashed with scrypt from node:crypto: memory-hard, no native dependencies, and
 * computed on the libuv thread pool, so a burst of logins never blocks the event loop (a pure-JS
 * bcrypt does). Parameters follow the OWASP recommendation N=2^15, r=8, p=3.
 *
 * Stored format: scrypt$<log2 N>$<r>$<p>$<salt>$<key> (base64). The parameters travel with the
 * hash, so the cost can be raised later without invalidating existing passwords.
 */

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 3;

interface ScryptParams {
  cost: number;
  blockSize: number;
  parallelization: number;
}

function deriveKey(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  const N = 2 ** params.cost;
  return new Promise((resolve, reject) => {
    scrypt(
      // The same password typed on different keyboards may come in different Unicode forms.
      password.normalize('NFKC'),
      salt,
      KEY_LENGTH,
      { N, r: params.blockSize, p: params.parallelization, maxmem: 256 * N * params.blockSize },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const params: ScryptParams = {
    cost: env.PASSWORD_HASH_COST,
    blockSize: BLOCK_SIZE,
    parallelization: PARALLELIZATION,
  };
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(password, salt, params);
  return [
    'scrypt',
    params.cost,
    params.blockSize,
    params.parallelization,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const parsed = parseHash(hash);
  if (!parsed) return false;

  const key = await deriveKey(password, parsed.salt, parsed.params);
  return key.length === parsed.key.length && timingSafeEqual(key, parsed.key);
}

function parseHash(hash: string) {
  const [algorithm, cost, blockSize, parallelization, salt, key, ...rest] = hash.split('$');
  if (algorithm !== 'scrypt' || !salt || !key || rest.length > 0) return null;

  const params = {
    cost: Number(cost),
    blockSize: Number(blockSize),
    parallelization: Number(parallelization),
  };
  // Bounds keep a corrupted record from requesting gigabytes of memory.
  const valid =
    isIntegerBetween(params.cost, 1, 20) &&
    isIntegerBetween(params.blockSize, 1, 32) &&
    isIntegerBetween(params.parallelization, 1, 16);
  if (!valid) return null;

  return { params, salt: Buffer.from(salt, 'base64'), key: Buffer.from(key, 'base64') };
}

const isIntegerBetween = (value: number, min: number, max: number) =>
  Number.isInteger(value) && value >= min && value <= max;

let dummyHash: Promise<string> | undefined;

/**
 * A valid hash to compare against when the user does not exist, so that a login attempt with an
 * unknown email takes as long as one with a wrong password and does not reveal registered emails.
 */
export function getDummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword('timing-attack-protection');
  return dummyHash;
}
