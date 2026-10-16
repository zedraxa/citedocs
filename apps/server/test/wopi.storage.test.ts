import { describe, it, expect, vi } from "vitest";
import { S3WopiStorage } from "../src/wopi/storage/s3Storage.js";
import { WopiFileNotFoundError } from "../src/wopi/storage/inMemoryStorage.js";
import type { S3Client } from "@aws-sdk/client-s3";

describe("S3WopiStorage (Offline Mocked)", () => {
  const fileId = "s3-doc-123";
  const content = Buffer.from("S3 Mock Content");

  it("retrieves file info using HeadObjectCommand", async () => {
    const mockSend = vi.fn().mockImplementation((command) => {
      if (command.constructor.name === "HeadObjectCommand") {
        return Promise.resolve({
          ContentLength: 1024,
          ETag: '"etag-version-1"',
          LastModified: new Date("2026-10-16T12:00:00Z"),
          ContentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          Metadata: {
            filename: "my-paper.docx",
            "owner-id": "user-42",
            version: "v1_s3",
          },
        });
      }
      throw new Error(`Unexpected command: ${command.constructor.name}`);
    });

    const mockClient = { send: mockSend } as unknown as S3Client;
    const storage = new S3WopiStorage({ client: mockClient, bucket: "test-bucket" });

    const info = await storage.getFileInfo(fileId);
    expect(info.id).toBe(fileId);
    expect(info.baseFileName).toBe("my-paper.docx");
    expect(info.ownerId).toBe("user-42");
    expect(info.size).toBe(1024);
    expect(info.version).toBe("v1_s3");
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("throws WopiFileNotFoundError when HeadObject returns 404 / NotFound", async () => {
    const notFoundError = new Error("Not Found");
    Object.assign(notFoundError, {
      name: "NotFound",
      $metadata: { httpStatusCode: 404 },
    });

    const mockSend = vi.fn().mockRejectedValue(notFoundError);
    const mockClient = { send: mockSend } as unknown as S3Client;
    const storage = new S3WopiStorage({ client: mockClient, bucket: "test-bucket" });

    await expect(storage.getFileInfo("missing-doc")).rejects.toThrow(WopiFileNotFoundError);
  });

  it("retrieves file body and metadata using GetObjectCommand", async () => {
    const mockSend = vi.fn().mockImplementation((command) => {
      if (command.constructor.name === "GetObjectCommand") {
        return Promise.resolve({
          Body: {
            transformToByteArray: () => Promise.resolve(new Uint8Array(content)),
          },
          Metadata: {
            filename: "paper.docx",
            "owner-id": "user-1",
            version: "v2",
          },
          LastModified: new Date("2026-10-16T12:00:00Z"),
          ContentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
      }
      throw new Error("Unexpected");
    });

    const mockClient = { send: mockSend } as unknown as S3Client;
    const storage = new S3WopiStorage({ client: mockClient });

    const result = await storage.getFile(fileId);
    expect(result.buffer.equals(content)).toBe(true);
    expect(result.metadata.baseFileName).toBe("paper.docx");
    expect(result.metadata.version).toBe("v2");
    expect(result.metadata.size).toBe(content.length);
  });

  it("throws WopiFileNotFoundError when GetObject returns NoSuchKey", async () => {
    const noSuchKeyError = new Error("NoSuchKey");
    Object.assign(noSuchKeyError, {
      name: "NoSuchKey",
      $metadata: { httpStatusCode: 404 },
    });

    const mockSend = vi.fn().mockRejectedValue(noSuchKeyError);
    const mockClient = { send: mockSend } as unknown as S3Client;
    const storage = new S3WopiStorage({ client: mockClient });

    await expect(storage.getFile("no-such-file")).rejects.toThrow(WopiFileNotFoundError);
  });

  it("saves updated file using PutObjectCommand", async () => {
    const mockSend = vi.fn().mockImplementation((command) => {
      if (command.constructor.name === "HeadObjectCommand") {
        return Promise.resolve({
          ContentLength: 100,
          Metadata: { filename: "existing.docx", "owner-id": "user-100" },
        });
      }
      if (command.constructor.name === "PutObjectCommand") {
        return Promise.resolve({ ETag: '"new-etag"' });
      }
      throw new Error("Unexpected");
    });

    const mockClient = { send: mockSend } as unknown as S3Client;
    const storage = new S3WopiStorage({ client: mockClient });

    const updated = await storage.putFile(fileId, content);
    expect(updated.metadata.size).toBe(content.length);
    expect(updated.metadata.baseFileName).toBe("existing.docx");
    expect(updated.metadata.version).toMatch(/^v_/);
    expect(mockSend).toHaveBeenCalledTimes(2); // Head then Put
  });

  it("creates a new file using PutObjectCommand", async () => {
    const mockSend = vi.fn().mockResolvedValue({ ETag: '"created-etag"' });
    const mockClient = { send: mockSend } as unknown as S3Client;
    const storage = new S3WopiStorage({ client: mockClient });

    const created = await storage.createFile(fileId, "brand-new.docx", "author-1", content);
    expect(created.id).toBe(fileId);
    expect(created.baseFileName).toBe("brand-new.docx");
    expect(created.ownerId).toBe("author-1");
    expect(created.size).toBe(content.length);
    expect(created.version).toMatch(/^v1_/);
  });
});
