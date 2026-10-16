import type { WopiFileMetadata, WopiStorage } from "../types.js";

export class WopiFileNotFoundError extends Error {
  constructor(fileId: string) {
    super(`File not found: ${fileId}`);
    this.name = "WopiFileNotFoundError";
  }
}

interface StoredFile {
  buffer: Buffer;
  metadata: WopiFileMetadata;
}

export class InMemoryWopiStorage implements WopiStorage {
  private files = new Map<string, StoredFile>();
  private versionCounter = 1;

  async getFileInfo(fileId: string): Promise<WopiFileMetadata> {
    const file = this.files.get(fileId);
    if (!file) {
      throw new WopiFileNotFoundError(fileId);
    }
    return { ...file.metadata };
  }

  async getFile(fileId: string): Promise<{ buffer: Buffer; metadata: WopiFileMetadata }> {
    const file = this.files.get(fileId);
    if (!file) {
      throw new WopiFileNotFoundError(fileId);
    }
    return {
      buffer: Buffer.from(file.buffer),
      metadata: { ...file.metadata },
    };
  }

  async putFile(fileId: string, content: Buffer): Promise<{ metadata: WopiFileMetadata }> {
    const file = this.files.get(fileId);
    const newVersion = `v${++this.versionCounter}_${Date.now()}`;
    const updatedAt = new Date();

    if (!file) {
      // Create new file entry if it didn't exist
      const metadata: WopiFileMetadata = {
        id: fileId,
        baseFileName: `${fileId}.docx`,
        ownerId: "system",
        size: content.length,
        version: newVersion,
        updatedAt,
      };
      this.files.set(fileId, {
        buffer: Buffer.from(content),
        metadata,
      });
      return { metadata: { ...metadata } };
    }

    file.buffer = Buffer.from(content);
    file.metadata.size = content.length;
    file.metadata.version = newVersion;
    file.metadata.updatedAt = updatedAt;

    return { metadata: { ...file.metadata } };
  }

  async createFile(
    fileId: string,
    baseFileName: string,
    ownerId: string,
    content: Buffer,
    contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ): Promise<WopiFileMetadata> {
    const version = `v1_${Date.now()}`;
    const updatedAt = new Date();
    const metadata: WopiFileMetadata = {
      id: fileId,
      baseFileName,
      ownerId,
      size: content.length,
      version,
      updatedAt,
      contentType,
    };

    this.files.set(fileId, {
      buffer: Buffer.from(content),
      metadata,
    });

    return { ...metadata };
  }

  clear(): void {
    this.files.clear();
    this.versionCounter = 1;
  }
}
