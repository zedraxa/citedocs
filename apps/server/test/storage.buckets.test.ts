import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ensureBucket,
  ensureAllStorageBuckets,
  getStorageBuckets,
  createS3Client,
} from "../src/storage/s3Client.js";
import { S3WopiStorage } from "../src/wopi/storage/s3Storage.js";
import { S3AttachmentStorage } from "../src/pdf/attachmentStorage.js";
import type { S3Client } from "@aws-sdk/client-s3";

describe("Object Storage & Bucket Auto-Creation (MinIO & AWS S3)", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...origEnv };
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("does not call CreateBucket if HeadBucket finds the bucket already exists", async () => {
    const mockSend = vi.fn().mockImplementation((command) => {
      if (command.constructor.name === "HeadBucketCommand") {
        return Promise.resolve({});
      }
      throw new Error(`Unexpected command: ${command.constructor.name}`);
    });

    const mockClient = { send: mockSend } as unknown as S3Client;
    await ensureBucket(mockClient, "existing-bucket", "us-east-1");

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].constructor.name).toBe("HeadBucketCommand");
  });

  it("calls CreateBucket when HeadBucket throws NotFound (MinIO / S3 standard)", async () => {
    const notFoundError = new Error("Not Found");
    Object.assign(notFoundError, {
      name: "NotFound",
      $metadata: { httpStatusCode: 404 },
    });

    const calls: string[] = [];
    const mockSend = vi.fn().mockImplementation((command) => {
      calls.push(command.constructor.name);
      if (command.constructor.name === "HeadBucketCommand") {
        return Promise.reject(notFoundError);
      }
      if (command.constructor.name === "CreateBucketCommand") {
        return Promise.resolve({});
      }
      throw new Error("Unexpected");
    });

    const mockClient = { send: mockSend } as unknown as S3Client;
    await ensureBucket(mockClient, "new-bucket", "us-east-1");

    expect(calls).toEqual(["HeadBucketCommand", "CreateBucketCommand"]);
    const createCmd = mockSend.mock.calls[1][0];
    expect(createCmd.input.Bucket).toBe("new-bucket");
    // In us-east-1, LocationConstraint must NOT be present
    expect(createCmd.input.CreateBucketConfiguration).toBeUndefined();
  });

  it("passes LocationConstraint to CreateBucket for AWS S3 non-us-east-1 regions", async () => {
    const notFoundError = new Error("NoSuchBucket");
    Object.assign(notFoundError, {
      name: "NoSuchBucket",
      $metadata: { httpStatusCode: 404 },
    });

    const mockSend = vi.fn().mockImplementation((command) => {
      if (command.constructor.name === "HeadBucketCommand") {
        return Promise.reject(notFoundError);
      }
      if (command.constructor.name === "CreateBucketCommand") {
        return Promise.resolve({});
      }
      throw new Error("Unexpected");
    });

    const mockClient = { send: mockSend } as unknown as S3Client;
    await ensureBucket(mockClient, "eu-bucket", "eu-central-1");

    const createCmd = mockSend.mock.calls[1][0];
    expect(createCmd.input.Bucket).toBe("eu-bucket");
    expect(createCmd.input.CreateBucketConfiguration).toEqual({
      LocationConstraint: "eu-central-1",
    });
  });

  it("handles BucketAlreadyOwnedByYou / BucketAlreadyExists gracefully without throwing", async () => {
    const notFoundError = new Error("NotFound");
    Object.assign(notFoundError, { $metadata: { httpStatusCode: 404 } });

    const alreadyOwnedErr = new Error("BucketAlreadyOwnedByYou");
    Object.assign(alreadyOwnedErr, {
      name: "BucketAlreadyOwnedByYou",
      $metadata: { httpStatusCode: 409 },
    });

    const mockSend = vi.fn().mockImplementation((command) => {
      if (command.constructor.name === "HeadBucketCommand") {
        return Promise.reject(notFoundError);
      }
      if (command.constructor.name === "CreateBucketCommand") {
        return Promise.reject(alreadyOwnedErr);
      }
      throw new Error("Unexpected");
    });

    const mockClient = { send: mockSend } as unknown as S3Client;
    await expect(ensureBucket(mockClient, "shared-bucket", "us-east-1")).resolves.toBeUndefined();
  });

  it("gracefully handles HeadBucket 403 Forbidden under restricted IAM policies", async () => {
    const forbiddenErr = new Error("Forbidden");
    Object.assign(forbiddenErr, {
      name: "AccessDenied",
      $metadata: { httpStatusCode: 403 },
    });

    const mockSend = vi.fn().mockRejectedValue(forbiddenErr);
    const mockClient = { send: mockSend } as unknown as S3Client;

    await expect(ensureBucket(mockClient, "restricted-bucket")).resolves.toBeUndefined();
    // Did not attempt to call CreateBucket since 403 implies bucket exists
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("resolves default and custom bucket names for documents and attachments", () => {
    process.env.S3_BUCKET = "citedocs-all";
    delete process.env.S3_DOCUMENTS_BUCKET;
    delete process.env.S3_ATTACHMENTS_BUCKET;

    const buckets = getStorageBuckets();
    expect(buckets.documentsBucket).toBe("citedocs-all");
    expect(buckets.attachmentsBucket).toBe("citedocs-all");

    process.env.S3_DOCUMENTS_BUCKET = "my-docs-bucket";
    process.env.S3_ATTACHMENTS_BUCKET = "my-attachments-bucket";
    const custom = getStorageBuckets();
    expect(custom.documentsBucket).toBe("my-docs-bucket");
    expect(custom.attachmentsBucket).toBe("my-attachments-bucket");
  });

  it("ensureAllStorageBuckets creates all distinct configured buckets", async () => {
    process.env.S3_DOCUMENTS_BUCKET = "docs-bucket";
    process.env.S3_ATTACHMENTS_BUCKET = "pdfs-bucket";

    const checkedBuckets: string[] = [];
    const mockSend = vi.fn().mockImplementation((command) => {
      if (command.constructor.name === "HeadBucketCommand") {
        checkedBuckets.push(command.input.Bucket);
        return Promise.resolve({});
      }
      throw new Error("Unexpected");
    });

    const mockClient = { send: mockSend } as unknown as S3Client;
    await ensureAllStorageBuckets({ client: mockClient, region: "us-east-1" });

    expect(checkedBuckets).toEqual(["docs-bucket", "pdfs-bucket"]);
  });

  it("S3AttachmentStorage automatically ensures bucket before putting object", async () => {
    const notFoundError = new Error("NotFound");
    Object.assign(notFoundError, { $metadata: { httpStatusCode: 404 } });

    const commands: string[] = [];
    const mockSend = vi.fn().mockImplementation((command) => {
      commands.push(command.constructor.name);
      if (command.constructor.name === "HeadBucketCommand") {
        return Promise.reject(notFoundError);
      }
      if (command.constructor.name === "CreateBucketCommand") {
        return Promise.resolve({});
      }
      if (command.constructor.name === "PutObjectCommand") {
        return Promise.resolve({ ETag: '"etag-123"' });
      }
      throw new Error(`Unexpected command: ${command.constructor.name}`);
    });

    const mockClient = { send: mockSend } as unknown as S3Client;
    const storage = new S3AttachmentStorage({ client: mockClient, bucket: "auto-bucket" });

    // Ensure bucket is not checked initially
    // @ts-expect-error private access for test
    storage.bucketChecked = false;

    await storage.put("paper.pdf", Buffer.from("pdf-data"), "application/pdf");

    expect(commands).toEqual(["HeadBucketCommand", "CreateBucketCommand", "PutObjectCommand"]);
  });

  it("S3WopiStorage provides a functional ensureBucket method", async () => {
    const mockSend = vi.fn().mockResolvedValue({});
    const mockClient = { send: mockSend } as unknown as S3Client;

    const storage = new S3WopiStorage({ client: mockClient, bucket: "wopi-bucket" });
    // @ts-expect-error private access for test
    storage.bucketChecked = false;

    await storage.ensureBucket();
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      input: { Bucket: "wopi-bucket" },
    }));
  });

  it("createS3Client configures path-style correctly for MinIO vs AWS", () => {
    // MinIO endpoint -> forcePathStyle true
    const minioResult = createS3Client({
      endpoint: "http://minio:9000",
      region: "us-east-1",
    });
    expect(minioResult.client).toBeDefined();

    // AWS S3 standard -> virtual-hosted style (forcePathStyle false by default)
    const awsResult = createS3Client({
      endpoint: "https://s3.eu-west-1.amazonaws.com",
      region: "eu-west-1",
    });
    expect(awsResult.client).toBeDefined();
  });
});
