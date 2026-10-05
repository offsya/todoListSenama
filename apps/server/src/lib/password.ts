import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, env.BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

let dummyHash: Promise<string> | undefined;

/**
 * A valid hash to compare against when the user does not exist, so that a login attempt with an
 * unknown email takes as long as one with a wrong password and does not reveal registered emails.
 */
export function getDummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword('timing-attack-protection');
  return dummyHash;
}
