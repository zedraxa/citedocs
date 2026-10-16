import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";

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

export interface S3AttachmentStorageOptions {
  bucket?: string;
  endpoint?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
  prefix?: string;
  client?: S3Client;
}

export class S3AttachmentStorage implements AttachmentStorage {
  private client: S3Client;
  private bucket: string;
  private prefix: string;

  constructor(options: S3AttachmentStorageOptions = {}) {
    this.bucket = options.bucket || process.env.S3_BUCKET || "citedocs-attachments";
    this.prefix = options.prefix ?? "attachments/";

    if (options.client) {
      this.client = options.client;
    } else {
      const endpoint = options.endpoint || process.env.S3_ENDPOINT || "http://localhost:9000";
      const region = options.region || process.env.S3_REGION || "us-east-1";
      const accessKeyId =
        options.accessKeyId || process.env.S3_ACCESS_KEY || process.env.MINIO_ROOT_USER || "citedocs_minio";
      const secretAccessKey =
        options.secretAccessKey ||
        process.env.S3_SECRET_KEY ||
        process.env.MINIO_ROOT_PASSWORD ||
        "citedocs_minio_password";
      const forcePathStyle = options.forcePathStyle ?? true;

      const clientConfig: S3ClientConfig = {
        endpoint,
        region,
        forcePathStyle,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      };

      this.client = new S3Client(clientConfig);
    }
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async put(key: string, data: Buffer | Uint8Array, contentType = "application/pdf"): Promise<void> {
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

      const chunks: Buffer[] = [];
      const stream = resp.Body as Readable;
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }

      return {
        data: Buffer.concat(chunks),
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
