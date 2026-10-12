import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { HttpError } from './http-error.js';

/**
 * Where todo attachments live. Objects are addressed by key only: the API streams them to the
 * owner and never hands out a URL that would open them directly.
 */
export interface FileStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Throws a 404 `HttpError` when there is no such object. */
  get(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
}

const attachmentGone = () => HttpError.notFound('Attachment not found');

export interface S3StorageOptions {
  bucket: string;
  region: string;
}

/**
 * A private S3 bucket. Credentials come from the default AWS chain: on EC2 the instance role,
 * locally the usual environment variables or ~/.aws profile. None are read by this code.
 */
export function createS3Storage({ bucket, region }: S3StorageOptions): FileStorage {
  const client = new S3Client({ region });

  return {
    put: async (key, body, contentType) => {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },
    get: async (key) => {
      try {
        const { Body } = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        if (!(Body instanceof Readable)) throw attachmentGone();
        return Body;
      } catch (error) {
        if (error instanceof NoSuchKey) throw attachmentGone();
        throw error;
      }
    },
    delete: async (key) => {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

/** Keeps files in memory. For tests. */
export function createMemoryStorage(): FileStorage & { files: Map<string, Buffer> } {
  const files = new Map<string, Buffer>();
  return {
    files,
    put: (key, body) => {
      files.set(key, Buffer.from(body));
      return Promise.resolve();
    },
    get: (key) => {
      const body = files.get(key);
      return body ? Promise.resolve(Readable.from([body])) : Promise.reject(attachmentGone());
    },
    delete: (key) => {
      files.delete(key);
      return Promise.resolve();
    },
  };
}
