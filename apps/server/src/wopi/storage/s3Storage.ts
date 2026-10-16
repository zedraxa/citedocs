import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import type { WopiFileMetadata, WopiStorage } from "../types.js";
import { WopiFileNotFoundError } from "./inMemoryStorage.js";

export interface S3WopiStorageOptions {
  bucket?: string;
  endpoint?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
  prefix?: string;
  client?: S3Client;
}

export class S3WopiStorage implements WopiStorage {
  private client: S3Client;
  private bucket: string;
  private prefix: string;
  private bucketChecked = false;

  private async ensureBucket(): Promise<void> {
    if (this.bucketChecked) return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.bucketChecked = true;
    } catch (err: unknown) {
      const error = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (
        error.name === "NotFound" ||
        error.name === "NoSuchBucket" ||
        error.$metadata?.httpStatusCode === 404
      ) {
        try {
          await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
          this.bucketChecked = true;
        } catch {
          this.bucketChecked = true;
        }
      }
    }
  }

  constructor(options: S3WopiStorageOptions = {}) {
    this.bucket = options.bucket || process.env.S3_BUCKET || "citedocs-attachments";
    this.prefix = options.prefix ?? "wopi-files/";

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

  private getKey(fileId: string): string {
    return `${this.prefix}${fileId}`;
  }

  async getFileInfo(fileId: string): Promise<WopiFileMetadata> {
    const key = this.getKey(fileId);
    try {
      const head = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      const metadata = head.Metadata || {};
      const baseFileName = metadata["filename"] || `${fileId}.docx`;
      const ownerId = metadata["owner-id"] || "system";
      const version = metadata["version"] || head.ETag?.replace(/"/g, "") || `v_${Date.now()}`;
      const size = head.ContentLength ?? 0;
      const updatedAt = head.LastModified || new Date();
      const contentType = head.ContentType || "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

      return {
        id: fileId,
        baseFileName,
        ownerId,
        size,
        version,
        updatedAt,
        contentType,
      };
    } catch (err: unknown) {
      const error = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        throw new WopiFileNotFoundError(fileId);
      }
      throw err;
    }
  }

  async getFile(fileId: string): Promise<{ buffer: Buffer; metadata: WopiFileMetadata }> {
    const key = this.getKey(fileId);
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      if (!response.Body) {
        throw new WopiFileNotFoundError(fileId);
      }

      const byteArray = await response.Body.transformToByteArray();
      const buffer = Buffer.from(byteArray);

      const metadata = response.Metadata || {};
      const baseFileName = metadata["filename"] || `${fileId}.docx`;
      const ownerId = metadata["owner-id"] || "system";
      const version = metadata["version"] || response.ETag?.replace(/"/g, "") || `v_${Date.now()}`;
      const size = buffer.length;
      const updatedAt = response.LastModified || new Date();
      const contentType = response.ContentType || "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

      return {
        buffer,
        metadata: {
          id: fileId,
          baseFileName,
          ownerId,
          size,
          version,
          updatedAt,
          contentType,
        },
      };
    } catch (err: unknown) {
      const error = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
        throw new WopiFileNotFoundError(fileId);
      }
      throw err;
    }
  }

  async putFile(fileId: string, content: Buffer): Promise<{ metadata: WopiFileMetadata }> {
    let currentMeta: WopiFileMetadata | null = null;
    try {
      currentMeta = await this.getFileInfo(fileId);
    } catch {
      // File may not exist yet
    }

    const key = this.getKey(fileId);
    const newVersion = `v_${Date.now()}`;
    const baseFileName = currentMeta?.baseFileName || `${fileId}.docx`;
    const ownerId = currentMeta?.ownerId || "system";
    const contentType =
      currentMeta?.contentType || "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    await this.ensureBucket();
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: content,
        ContentType: contentType,
        Metadata: {
          filename: baseFileName,
          "owner-id": ownerId,
          version: newVersion,
        },
      }),
    );

    const updatedMetadata: WopiFileMetadata = {
      id: fileId,
      baseFileName,
      ownerId,
      size: content.length,
      version: newVersion,
      updatedAt: new Date(),
      contentType,
    };

    return { metadata: updatedMetadata };
  }

  async createFile(
    fileId: string,
    baseFileName: string,
    ownerId: string,
    content: Buffer,
    contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ): Promise<WopiFileMetadata> {
    const key = this.getKey(fileId);
    const version = `v1_${Date.now()}`;

    await this.ensureBucket();
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: content,
        ContentType: contentType,
        Metadata: {
          filename: baseFileName,
          "owner-id": ownerId,
          version,
        },
      }),
    );

    return {
      id: fileId,
      baseFileName,
      ownerId,
      size: content.length,
      version,
      updatedAt: new Date(),
      contentType,
    };
  }
}
