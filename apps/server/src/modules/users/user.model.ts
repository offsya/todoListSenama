import { EMAIL_MAX_LENGTH, type User } from '@todo/shared';
import { model, Schema, type Types } from 'mongoose';

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: EMAIL_MAX_LENGTH,
    },
    // Excluded from queries by default so the hash cannot leak by accident.
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true },
);

export const UserModel = model('User', userSchema);

interface UserRecord {
  _id: Types.ObjectId;
  email: string;
  createdAt: Date;
}

export function toUserDto(user: UserRecord): User {
  return {
    id: user._id.toString(),
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  };
}
