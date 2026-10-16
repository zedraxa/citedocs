export { exportDocumentToDocx, htmlToTextRuns } from "./exporter.js";

export { importDocxZoteroFields } from "./importer.js";

export {
  FldChar,
  InstrText,
  createZoteroCitationFieldRuns,
  createBibliographyBeginRuns,
  createBibliographyEndRuns,
} from "./fields.js";

export type {
  DocxExportInput,
  DocxParagraph,
  DocxParagraphChild,
  DocxTextRun,
  DocxCitationRun,
  DocxBibliography,
  ZoteroCitationItem,
  ZoteroCitationPayload,
  ZoteroLocatorLabel,
  ExtractedZoteroField,
  ExtractedZoteroFieldsResult,
} from "./types.js";
