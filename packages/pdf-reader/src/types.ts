/**
 * Types for Zotero PDF Reader integration and Zotero Web API annotation mapping.
 */

export interface ZoteroReaderAnnotationPosition {
  pageIndex: number;
  rects: Array<[number, number, number, number]>;
  rotation?: number;
}

export type ZoteroAnnotationType = "highlight" | "underline" | "note" | "image" | "ink";

export interface ZoteroReaderAnnotation {
  id: string; // Corresponding to Zotero item key
  type: ZoteroAnnotationType;
  color: string;
  pageLabel?: string;
  sortIndex: string;
  position: ZoteroReaderAnnotationPosition;
  text?: string;
  comment?: string;
  tags?: Array<{ tag: string } | string>;
  dateCreated?: string;
  dateModified?: string;
  image?: string;
  authorName?: string;
}

/**
 * Official Zotero Web API v3 annotation item data format
 */
export interface ZoteroAnnotationItemData {
  key: string;
  version: number;
  parentItem: string;
  itemType: "annotation";
  annotationType: ZoteroAnnotationType;
  annotationText: string;
  annotationComment: string;
  annotationColor: string;
  annotationPageLabel: string;
  annotationSortIndex: string;
  annotationPosition: string; // JSON-stringified ZoteroReaderAnnotationPosition
  tags: Array<{ tag: string }>;
  dateAdded?: string;
  dateModified?: string;
}

export interface ZoteroAnnotationItem {
  key: string;
  version: number;
  data: ZoteroAnnotationItemData;
}

/**
 * Reader creation options passed to window.createReader(options)
 */
export interface ZoteroReaderOptions {
  type: "pdf" | "epub" | "snapshot";
  platform?: "web" | "zotero" | "ios" | "android";
  data?: ArrayBuffer | Uint8Array | string;
  password?: string;
  readOnly?: boolean;
  authorName?: string;
  annotations?: ZoteroReaderAnnotation[];
  onSaveAnnotations?: (annotations: ZoteroReaderAnnotation[]) => Promise<void> | void;
  onDeleteAnnotations?: (ids: string[]) => Promise<void> | void;
  onOpenContextMenu?: (params: unknown) => void;
  onOpenTagsPopup?: (params: unknown) => void;
  onAddToNote?: (params: unknown) => void;
  onSetZoom?: (zoom: number | string) => void;
}

export interface ZoteroReaderInstance {
  setAnnotations: (annotations: ZoteroReaderAnnotation[]) => void;
  unsetAnnotations: (ids: string[]) => void;
  getAnnotations?: () => ZoteroReaderAnnotation[];
  destroy?: () => void;
}

/**
 * PostMessage protocol between CiteDocs parent shell and embedded Zotero PDF reader iframe
 */
export type PdfReaderPostMessage =
  | {
      type: "CITEDOCS_PDF_INIT";
      payload: {
        attachmentId: string;
        pdfUrl: string;
        title: string;
        readOnly?: boolean;
        authorName?: string;
        annotations: ZoteroReaderAnnotation[];
      };
    }
  | {
      type: "CITEDOCS_PDF_READY";
      payload?: {
        attachmentId: string;
        pageCount?: number;
      };
    }
  | {
      type: "CITEDOCS_PDF_SET_ANNOTATIONS";
      payload: {
        annotations: ZoteroReaderAnnotation[];
      };
    }
  | {
      type: "CITEDOCS_PDF_SAVE_ANNOTATIONS";
      payload: {
        attachmentId: string;
        annotations: ZoteroReaderAnnotation[];
      };
    }
  | {
      type: "CITEDOCS_PDF_DELETE_ANNOTATIONS";
      payload: {
        attachmentId: string;
        ids: string[];
      };
    }
  | {
      type: "CITEDOCS_PDF_CITE";
      payload: {
        attachmentId: string;
        annotationId: string;
        text: string;
        page: number;
        pageLabel: string;
        locator: string;
        color?: string;
        comment?: string;
      };
    };
