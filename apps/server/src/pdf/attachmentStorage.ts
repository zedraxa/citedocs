import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

export interface AttachmentStorage {
  put(key: string, data: Buffer | Uint8Array, contentType?: string): Promise<void>;
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
}

export class InMemoryAttachmentStorage implements AttachmentStorage {
  private files = new Map<string, { data: Buffer; contentType: string }>();

  async put(key: string, data: Buffer | Uint8Array, contentType = "application/pdf"): Promise<void> {
    this.files.set(key, {
      data: Buffer.isBuffer(data) ? data : Buffer.from(data),
      contentType,
    });
  }

  async get(key: string): Promise<{ data: Buffer; contentType: string } | null> {
    const file = this.files.get(key);
    if (!file) return null;
    return { data: Buffer.from(file.data), contentType: file.contentType };
  }

  async delete(key: string): Promise<void> {
    this.files.delete(key);
  }

  clear(): void {
    this.files.clear();
  }
}

import {
  createS3Client,
  ensureBucket as ensureBucketHelper,
  type S3StorageOptions,
} from "../storage/s3Client.js";

export type S3AttachmentStorageOptions = S3StorageOptions;

export class S3AttachmentStorage implements AttachmentStorage {
  private client: S3Client;
  private bucket: string;
  private prefix: string;
  private region: string;
  private bucketChecked = false;

  public async ensureBucket(): Promise<void> {
    if (this.bucketChecked) return;
    await ensureBucketHelper(this.client, this.bucket, this.region);
    this.bucketChecked = true;
  }

  constructor(options: S3AttachmentStorageOptions = {}) {
    this.bucket =
      options.bucket ||
      process.env.S3_ATTACHMENTS_BUCKET ||
      process.env.S3_BUCKET ||
      "citedocs-attachments";
    this.prefix = options.prefix ?? "attachments/";

    const { client, region } = createS3Client(options);
    this.client = client;
    this.region = region;
    if (options.client) {
      this.bucketChecked = true;
    }
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async put(key: string, data: Buffer | Uint8Array, contentType = "application/pdf"): Promise<void> {
    await this.ensureBucket();
    const s3Key = this.getKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
        Body: data,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<{ data: Buffer; contentType: string } | null> {
    const s3Key = this.getKey(key);
    try {
      const resp = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: s3Key,
        }),
      );

      if (!resp.Body) return null;

      const bytes = await resp.Body.transformToByteArray();
      return {
        data: Buffer.from(bytes),
        contentType: resp.ContentType || "application/pdf",
      };
    } catch (err: unknown) {
      const s3Error = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (s3Error.name === "NoSuchKey" || s3Error.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const s3Key = this.getKey(key);
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
      }),
    );
  }
}
