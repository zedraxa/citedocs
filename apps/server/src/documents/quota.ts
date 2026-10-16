import type { IDocumentRepository } from "../repositories/documentRepository.js";
import type { StorageQuotaInfo } from "./types.js";

export const DEFAULT_STORAGE_QUOTA_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB default
export const DEFAULT_MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB default

export class StorageQuotaExceededError extends Error {
  readonly used: number;
  readonly incomingBytes: number;
  readonly quota: number;

  constructor(used: number, incomingBytes: number, quota: number) {
    super(
      `Storage quota exceeded: current usage ${used} bytes plus requested ${incomingBytes} bytes exceeds total quota of ${quota} bytes.`
    );
    this.name = "StorageQuotaExceededError";
    this.used = used;
    this.incomingBytes = incomingBytes;
    this.quota = quota;
  }
}

export function getUserQuotaBytes(): number {
  const envVal = process.env.STORAGE_QUOTA_BYTES || process.env.USER_STORAGE_QUOTA_BYTES;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_STORAGE_QUOTA_BYTES;
}

export function getMaxUploadSizeBytes(): number {
  const envVal = process.env.MAX_UPLOAD_SIZE_BYTES;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_MAX_UPLOAD_BYTES;
}

export async function assertUserQuota(
  documentRepo: IDocumentRepository,
  userId: string,
  incomingBytes: number,
  replacedDocBytes = 0
): Promise<StorageQuotaInfo> {
  const used = await documentRepo.getStorageUsage(userId);
  const total = getUserQuotaBytes();

  const effectiveUsed = Math.max(0, used - replacedDocBytes);
  if (effectiveUsed + incomingBytes > total) {
    throw new StorageQuotaExceededError(used, incomingBytes, total);
  }

  const remaining = Math.max(0, total - (effectiveUsed + incomingBytes));
  const percentage = Math.min(100, Math.round(((effectiveUsed + incomingBytes) / total) * 10000) / 100);

  return {
    used: effectiveUsed + incomingBytes,
    total,
    percentage,
    remaining,
  };
}

export async function getQuotaInfo(
  documentRepo: IDocumentRepository,
  userId: string
): Promise<StorageQuotaInfo> {
  const used = await documentRepo.getStorageUsage(userId);
  const total = getUserQuotaBytes();
  const remaining = Math.max(0, total - used);
  const percentage = total > 0 ? Math.min(100, Math.round((used / total) * 10000) / 100) : 0;

  return {
    used,
    total,
    remaining,
    percentage,
  };
}
