import type { Attachment } from "../db/schema.js";
import type { ZoteroReaderAnnotation, ZoteroAnnotationItem } from "@citedocs/pdf-reader";

export interface CreateAttachmentInput {
  itemId?: string | null;
  title: string;
  contentType?: string;
  filePath: string;
  fileSize?: number;
  md5Hash?: string | null;
}

export interface CreateAnnotationInput {
  attachmentId: string;
  zoteroKey?: string;
  parentItemKey?: string | null;
  annotationType: "highlight" | "underline" | "note" | "image" | "ink";
  annotationText?: string;
  annotationComment?: string;
  annotationColor?: string;
  annotationPageLabel?: string;
  annotationSortIndex?: string;
  annotationPosition?: Record<string, unknown> | null;
  imagePath?: string | null;
}

export interface UpdateAnnotationInput {
  annotationText?: string;
  annotationComment?: string;
  annotationColor?: string;
  annotationPageLabel?: string;
  annotationSortIndex?: string;
  annotationPosition?: Record<string, unknown> | null;
  imagePath?: string | null;
}

export interface ZoteroSyncResult {
  pushedCount: number;
  pulledCount: number;
  syncedAt: string;
  status: "success" | "partial" | "error" | "skipped";
  message?: string;
}

export interface AttachmentDetail extends Attachment {
  downloadUrl: string;
  annotationsCount?: number;
}

export interface AnnotationResponsePayload {
  annotations: ZoteroReaderAnnotation[];
  zoteroItems: ZoteroAnnotationItem[];
}
