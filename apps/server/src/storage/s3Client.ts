import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  type CreateBucketCommandInput,
  type BucketLocationConstraint,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";

export interface S3StorageOptions {
  bucket?: string;
  endpoint?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
  prefix?: string;
  client?: S3Client;
}

/**
 * Creates an S3Client configured for either local MinIO or AWS S3.
 */
export function createS3Client(options: S3StorageOptions = {}): {
  client: S3Client;
  region: string;
} {
  if (options.client) {
    const region = options.region || process.env.S3_REGION || process.env.AWS_REGION || "us-east-1";
    return { client: options.client, region };
  }

  const endpoint = options.endpoint || process.env.S3_ENDPOINT;
  const region = options.region || process.env.S3_REGION || process.env.AWS_REGION || "us-east-1";
  const accessKeyId =
    options.accessKeyId ||
    process.env.S3_ACCESS_KEY ||
    process.env.AWS_ACCESS_KEY_ID ||
    process.env.MINIO_ROOT_USER ||
    "citedocs_minio";
  const secretAccessKey =
    options.secretAccessKey ||
    process.env.S3_SECRET_KEY ||
    process.env.AWS_SECRET_ACCESS_KEY ||
    process.env.MINIO_ROOT_PASSWORD ||
    "citedocs_minio_password";

  // MinIO and local endpoints require forcePathStyle: true.
  // AWS S3 standard endpoints default to virtual-hosted style (forcePathStyle: false).
  const isAwsEndpoint = !endpoint || endpoint.includes("amazonaws.com");
  const forcePathStyle =
    options.forcePathStyle ??
    (process.env.S3_FORCE_PATH_STYLE !== undefined
      ? process.env.S3_FORCE_PATH_STYLE === "true"
      : !isAwsEndpoint);

  const clientConfig: S3ClientConfig = {
    region,
    forcePathStyle,
  };

  if (endpoint) {
    clientConfig.endpoint = endpoint;
  }

  if (accessKeyId && secretAccessKey) {
    clientConfig.credentials = {
      accessKeyId,
      secretAccessKey,
    };
  }

  return { client: new S3Client(clientConfig), region };
}

/**
 * Ensures an S3 or MinIO bucket exists, creating it if missing.
 * Handles both MinIO and AWS S3 quirks (e.g. LocationConstraint requirement
 * outside us-east-1, 403 Forbidden under restricted IAM policies, and
 * BucketAlreadyOwnedByYou/BucketAlreadyExists concurrency).
 */
export async function ensureBucket(
  client: S3Client,
  bucketName: string,
  region = "us-east-1",
  logger?: { info?: (msg: string) => void; warn?: (msg: string, err?: unknown) => void }
): Promise<void> {
  if (!bucketName) return;

  try {
    await client.send(new HeadBucketCommand({ Bucket: bucketName }));
    logger?.info?.(`S3 bucket "${bucketName}" exists and is accessible.`);
    return;
  } catch (err: unknown) {
    const error = err as {
      name?: string;
      Code?: string;
      $metadata?: { httpStatusCode?: number };
    };

    const statusCode = error.$metadata?.httpStatusCode;
    const isNotFound =
      error.name === "NotFound" ||
      error.name === "NoSuchBucket" ||
      error.Code === "NoSuchBucket" ||
      statusCode === 404;

    if (!isNotFound) {
      if (statusCode === 403) {
        logger?.warn?.(
          `S3 HeadBucket returned 403 Forbidden for "${bucketName}". Assuming bucket exists under restricted IAM policy.`
        );
        return;
      }
      logger?.warn?.(`Unexpected error inspecting S3 bucket "${bucketName}":`, err);
    }

    try {
      const createParams: CreateBucketCommandInput = {
        Bucket: bucketName,
      };

      // In AWS S3, LocationConstraint must NOT be set for "us-east-1".
      // For all other AWS regions, LocationConstraint IS required.
      if (region && region !== "us-east-1") {
        createParams.CreateBucketConfiguration = {
          LocationConstraint: region as BucketLocationConstraint,
        };
      }

      await client.send(new CreateBucketCommand(createParams));
      logger?.info?.(`Successfully created S3 bucket "${bucketName}" in region "${region}".`);
    } catch (createErr: unknown) {
      const cErr = createErr as {
        name?: string;
        Code?: string;
        $metadata?: { httpStatusCode?: number };
      };

      if (
        cErr.name === "BucketAlreadyOwnedByYou" ||
        cErr.name === "BucketAlreadyExists" ||
        cErr.Code === "BucketAlreadyOwnedByYou" ||
        cErr.Code === "BucketAlreadyExists" ||
        cErr.$metadata?.httpStatusCode === 409
      ) {
        logger?.info?.(`S3 bucket "${bucketName}" already exists.`);
        return;
      }

      logger?.warn?.(`Failed to create S3 bucket "${bucketName}":`, createErr);
    }
  }
}

/**
 * Resolves all bucket names used by CiteDocs:
 * - Documents & WOPI storage bucket
 * - Attachments & PDF annotations bucket
 */
export function getStorageBuckets(): {
  documentsBucket: string;
  attachmentsBucket: string;
} {
  const fallback = process.env.S3_BUCKET || "citedocs-attachments";
  const documentsBucket = process.env.S3_DOCUMENTS_BUCKET || fallback;
  const attachmentsBucket = process.env.S3_ATTACHMENTS_BUCKET || fallback;

  return { documentsBucket, attachmentsBucket };
}

/**
 * Ensures all buckets used by CiteDocs are created on startup.
 */
export async function ensureAllStorageBuckets(options?: {
  client?: S3Client;
  region?: string;
  logger?: { info?: (msg: string) => void; warn?: (msg: string, err?: unknown) => void };
}): Promise<void> {
  const { client, region } = options?.client
    ? { client: options.client, region: options.region || "us-east-1" }
    : createS3Client(options);

  const { documentsBucket, attachmentsBucket } = getStorageBuckets();
  const bucketsToEnsure = Array.from(new Set([documentsBucket, attachmentsBucket]));

  for (const bucket of bucketsToEnsure) {
    await ensureBucket(client, bucket, region, options?.logger);
  }
}
