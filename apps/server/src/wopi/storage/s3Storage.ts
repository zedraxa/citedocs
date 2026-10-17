import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import type { WopiFileMetadata, WopiStorage } from "../types.js";
import { WopiFileNotFoundError } from "./inMemoryStorage.js";
import {
  createS3Client,
  ensureBucket as ensureBucketHelper,
  type S3StorageOptions,
} from "../../storage/s3Client.js";

import { encodeS3MetaValue, decodeS3MetaValue } from "../../storage/s3Metadata.js";

export type S3WopiStorageOptions = S3StorageOptions;

export class S3WopiStorage implements WopiStorage {
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

  constructor(options: S3WopiStorageOptions = {}) {
    this.bucket =
      options.bucket ||
      process.env.S3_DOCUMENTS_BUCKET ||
      process.env.S3_BUCKET ||
      "citedocs-attachments";
    this.prefix = options.prefix ?? "wopi-files/";

    const { client, region } = createS3Client(options);
    this.client = client;
    this.region = region;
    if (options.client) {
      this.bucketChecked = true;
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
      const baseFileName = decodeS3MetaValue(metadata["filename"] || `${fileId}.docx`);
      const ownerId = decodeS3MetaValue(metadata["owner-id"] || "system");
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
      const baseFileName = decodeS3MetaValue(metadata["filename"] || `${fileId}.docx`);
      const ownerId = decodeS3MetaValue(metadata["owner-id"] || "system");
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
          filename: encodeS3MetaValue(baseFileName),
          "owner-id": encodeS3MetaValue(ownerId),
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
          filename: encodeS3MetaValue(baseFileName),
          "owner-id": encodeS3MetaValue(ownerId),
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
