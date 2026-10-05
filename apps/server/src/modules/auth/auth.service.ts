import type { AuthResponse, LoginInput, RegisterInput, User } from '@todo/shared';
import mongoose from 'mongoose';
import { HttpError } from '../../lib/http-error.js';
import { signAccessToken } from '../../lib/jwt.js';
import { getDummyPasswordHash, hashPassword, verifyPassword } from '../../lib/password.js';
import { toUserDto, UserModel } from '../users/user.model.js';

const emailTaken = () => HttpError.conflict('Email is already registered');

export async function register({ email, password }: RegisterInput): Promise<AuthResponse> {
  // Cheap pre-check to skip hashing for a taken email; the unique index is the real guarantee.
  if (await UserModel.exists({ email })) throw emailTaken();

  const passwordHash = await hashPassword(password);
  try {
    const user = await UserModel.create({ email, passwordHash });
    return { token: signAccessToken(user._id.toString()), user: toUserDto(user) };
  } catch (error) {
    // Two concurrent registrations with the same email: the second one hits the unique index.
    if (isDuplicateKeyError(error)) throw emailTaken();
    throw error;
  }
}

export async function login({ email, password }: LoginInput): Promise<AuthResponse> {
  const user = await UserModel.findOne({ email }).select('+passwordHash');

  // Always run bcrypt, even for unknown emails, so timing does not reveal which emails exist.
  const passwordMatches = await verifyPassword(
    password,
    user?.passwordHash ?? (await getDummyPasswordHash()),
  );
  if (!user || !passwordMatches) {
    // Same message for both cases for the same reason.
    throw HttpError.unauthorized('Invalid email or password');
  }

  return { token: signAccessToken(user._id.toString()), user: toUserDto(user) };
}

export async function getCurrentUser(userId: string): Promise<User> {
  const user = await UserModel.findById(userId).lean();
  if (!user) throw HttpError.unauthorized('User no longer exists');
  return toUserDto(user);
}

function isDuplicateKeyError(error: unknown): boolean {
  return error instanceof mongoose.mongo.MongoServerError && error.code === 11000;
}
