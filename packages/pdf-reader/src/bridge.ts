import type {
  PdfReaderPostMessage,
  ZoteroReaderAnnotation,
} from "./types.js";

/**
 * Validates whether an incoming postMessage data matches the PdfReaderPostMessage format.
 */
export function isPdfReaderMessage(data: unknown): data is PdfReaderPostMessage {
  if (!data || typeof data !== "object") return false;
  const msg = data as { type?: unknown; payload?: unknown };
  if (typeof msg.type !== "string") return false;

  return [
    "CITEDOCS_PDF_INIT",
    "CITEDOCS_PDF_READY",
    "CITEDOCS_PDF_SET_ANNOTATIONS",
    "CITEDOCS_PDF_SAVE_ANNOTATIONS",
    "CITEDOCS_PDF_DELETE_ANNOTATIONS",
    "CITEDOCS_PDF_CITE",
  ].includes(msg.type);
}

/**
 * Safely posts a PdfReader message to a target window or iframe.
 */
export function postToPdfReader(
  target: Window | HTMLIFrameElement,
  message: PdfReaderPostMessage,
  targetOrigin = "*",
): void {
  const targetWindow = "contentWindow" in target ? target.contentWindow : target;
  if (!targetWindow) return;

  targetWindow.postMessage(message, targetOrigin);
}

/**
 * Builder for CITEDOCS_PDF_INIT message.
 */
export function buildPdfInitMessage(params: {
  attachmentId: string;
  pdfUrl: string;
  title: string;
  readOnly?: boolean;
  authorName?: string;
  annotations?: ZoteroReaderAnnotation[];
}): PdfReaderPostMessage {
  return {
    type: "CITEDOCS_PDF_INIT",
    payload: {
      attachmentId: params.attachmentId,
      pdfUrl: params.pdfUrl,
      title: params.title,
      readOnly: params.readOnly,
      authorName: params.authorName,
      annotations: params.annotations ?? [],
    },
  };
}

/**
 * Builder for CITEDOCS_PDF_SET_ANNOTATIONS message.
 */
export function buildPdfSetAnnotationsMessage(
  annotations: ZoteroReaderAnnotation[],
): PdfReaderPostMessage {
  return {
    type: "CITEDOCS_PDF_SET_ANNOTATIONS",
    payload: {
      annotations,
    },
  };
}

/**
 * Builder for CITEDOCS_PDF_SAVE_ANNOTATIONS message.
 */
export function buildPdfSaveAnnotationsMessage(
  attachmentId: string,
  annotations: ZoteroReaderAnnotation[],
): PdfReaderPostMessage {
  return {
    type: "CITEDOCS_PDF_SAVE_ANNOTATIONS",
    payload: {
      attachmentId,
      annotations,
    },
  };
}

/**
 * Builder for CITEDOCS_PDF_DELETE_ANNOTATIONS message.
 */
export function buildPdfDeleteAnnotationsMessage(
  attachmentId: string,
  ids: string[],
): PdfReaderPostMessage {
  return {
    type: "CITEDOCS_PDF_DELETE_ANNOTATIONS",
    payload: {
      attachmentId,
      ids,
    },
  };
}

/**
 * Builder for CITEDOCS_PDF_CITE message (when user requests "Cite this").
 */
export function buildPdfCiteMessage(params: {
  attachmentId: string;
  annotation: ZoteroReaderAnnotation;
  customLocator?: string;
}): PdfReaderPostMessage {
  const page = (params.annotation.position?.pageIndex ?? 0) + 1;
  const pageLabel = params.annotation.pageLabel || String(page);
  const locator = params.customLocator || pageLabel;

  return {
    type: "CITEDOCS_PDF_CITE",
    payload: {
      attachmentId: params.attachmentId,
      annotationId: params.annotation.id,
      text: params.annotation.text || "",
      page,
      pageLabel,
      locator,
      color: params.annotation.color,
      comment: params.annotation.comment,
    },
  };
}
