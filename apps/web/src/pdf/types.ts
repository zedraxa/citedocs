import type { ZoteroReaderAnnotation } from "@citedocs/pdf-reader";

export interface PdfAttachment {
  id: string;
  itemId?: string | null;
  title: string;
  contentType?: string;
  downloadUrl: string;
  fileSize?: number;
}

export interface PdfCitationEvent {
  attachmentId: string;
  annotationId: string;
  text: string;
  page: number;
  pageLabel: string;
  locator: string;
  color?: string;
  comment?: string;
}

export type PdfReaderViewMode = "panel" | "fullscreen";

export interface PdfReaderPanelProps {
  userId: string;
  attachment: PdfAttachment | null;
  isOpen: boolean;
  onClose: () => void;
  onCiteAnnotation?: (event: PdfCitationEvent) => void;
  collaboraIframeRef?: React.RefObject<HTMLIFrameElement | null>;
  initialViewMode?: PdfReaderViewMode;
  lang?: "en" | "tr";
}

export interface PdfReaderFrameProps {
  userId: string;
  attachmentId: string;
  pdfUrl: string;
  title: string;
  initialAnnotations?: ZoteroReaderAnnotation[];
  readOnly?: boolean;
  onAnnotationsChange?: (annotations: ZoteroReaderAnnotation[]) => void;
  onCite?: (event: PdfCitationEvent) => void;
  className?: string;
}
