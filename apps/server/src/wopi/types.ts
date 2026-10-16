export interface CheckFileInfoResponse {
  BaseFileName: string;
  OwnerId: string;
  Size: number;
  UserId: string;
  UserFriendlyName: string;
  UserCanWrite: boolean;
  Version: string;
  SupportsLocks: boolean;
  SupportsGetLock: boolean;
  SupportsExtendedLockLength: boolean;
  SupportsUpdate: boolean;
  PostMessageOrigin: string;
  HideSaveOption?: boolean;
  HideExportOption?: boolean;
  EnableOwnerTermination?: boolean;
  BreadcrumbBrandName?: string;
  BreadcrumbBrandUrl?: string;
  LastModifiedTime?: string;
  UserCanNotWriteRelative?: boolean;
}

export interface WopiTokenPayload {
  fileId: string;
  userId: string;
  userName: string;
  canWrite: boolean;
  iat: number;
  exp: number;
}

export interface WopiFileMetadata {
  id: string;
  baseFileName: string;
  ownerId: string;
  size: number;
  version: string;
  updatedAt: Date;
  contentType?: string;
}

export interface WopiStorage {
  getFileInfo(fileId: string): Promise<WopiFileMetadata>;
  getFile(fileId: string): Promise<{ buffer: Buffer; metadata: WopiFileMetadata }>;
  putFile(fileId: string, content: Buffer): Promise<{ metadata: WopiFileMetadata }>;
  createFile?(
    fileId: string,
    baseFileName: string,
    ownerId: string,
    content: Buffer,
    contentType?: string,
  ): Promise<WopiFileMetadata>;
}

export interface LockResult {
  success: boolean;
  currentLock: string;
}

export interface WopiDiscoveryAction {
  name: string;
  ext: string;
  urlsrc: string;
}
