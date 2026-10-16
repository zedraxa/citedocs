/**
 * Writes Zotero-compatible citation fields into a Collabora (LibreOffice) document using plain
 * UNO commands sent over the Collabora PostMessage API (Send_UNO_Command). This mirrors what
 * Collabora's built-in Zotero integration does for .docx files ("Field" mode):
 *   - citations:    ADDIN ZOTERO_ITEM CSL_CITATION {json}   (.uno:TextFormField / .uno:TextFormFields)
 *   - bibliography: ADDIN ZOTERO_BIBL {json} CSL_BIBLIOGRAPHY
 *   - document prefs: custom document properties ZOTERO_PREF_1..n (.uno:SetDocumentProperties)
 * No Python/macros are needed, so it works with the stock CODE image.
 */
import { sendUnoCommand } from "./postMessage.js";

type Target = Window | HTMLIFrameElement | null;
const S = (value: string) => ({ type: "string", value });
const FIELD_TYPE = "vnd.oasis.opendocument.field.UNHANDLED";
export const CITATION_PREFIX = "ADDIN ZOTERO_ITEM CSL_CITATION";
export const BIBL_PREFIX = "ADDIN ZOTERO_BIBL";
const BIBL_CODE = `${BIBL_PREFIX} {"uncited":[],"omitted":[],"custom":[]} CSL_BIBLIOGRAPHY`;

export function citationFieldArgs(payload: unknown, text: string) {
  return {
    FieldType: S(FIELD_TYPE),
    FieldCommand: S(`${CITATION_PREFIX} ${JSON.stringify(payload)}`),
    FieldResult: S(text),
  };
}

export function bibliographyFieldArgs(html: string) {
  return { FieldType: S(FIELD_TYPE), FieldCommand: S(BIBL_CODE), FieldResult: S(html) };
}

export function insertCitationField(t: Target, payload: unknown, text: string) {
  const ok = sendUnoCommand(t, ".uno:TextFormField", citationFieldArgs(payload, text));
  // The cursor is left inside the (protected) field result; step past the field end mark so
  // typing and further insertions don't hit "Read-Only Content".
  sendUnoCommand(t, ".uno:GoRight");
  return ok;
}

/** Rewrites every ZOTERO_ITEM field in document order (used for restyle / renumbering). */
export function updateCitationFields(t: Target, list: Array<{ payload: unknown; text: string }>) {
  if (!list.length) return false;
  return sendUnoCommand(t, ".uno:TextFormFields", {
    FieldType: S(FIELD_TYPE),
    FieldCommandPrefix: S(CITATION_PREFIX),
    Fields: {
      type: "[][]com.sun.star.beans.PropertyValue",
      value: list.map((c) => citationFieldArgs(c.payload, c.text)),
    },
  });
  // Updating fields leaves the cursor inside the last updated field result.
  sendUnoCommand(t, ".uno:GoRight");
  return true;
}

/** Inserts the bibliography field at the end of the document. */
export function insertBibliographyField(t: Target, html: string) {
  sendUnoCommand(t, ".uno:GoToEndOfDoc");
  sendUnoCommand(t, ".uno:InsertPara");
  const ok = sendUnoCommand(t, ".uno:TextFormField", bibliographyFieldArgs(html));
  sendUnoCommand(t, ".uno:GoRight");
  return ok;
}

export function updateBibliographyField(t: Target, html: string) {
  return sendUnoCommand(t, ".uno:TextFormFields", {
    FieldType: S(FIELD_TYPE),
    FieldCommandPrefix: S(BIBL_PREFIX),
    Fields: { type: "[][]com.sun.star.beans.PropertyValue", value: [bibliographyFieldArgs(html)] },
  });
  sendUnoCommand(t, ".uno:GoRight");
  return true;
}

export function zoteroPrefsXml(styleId: string, hasBibliography: boolean, locale = "en-US") {
  const id = styleId.startsWith("http") ? styleId : `http://www.zotero.org/styles/${styleId}`;
  return (
    `<data data-version="3" zotero-version="7.0"><session id="citedocs"/>` +
    `<style id="${id}" locale="${locale}" hasBibliography="${hasBibliography ? 1 : 0}" bibliographyStyleHasBeenSet="${hasBibliography ? 1 : 0}"/>` +
    `<prefs><pref name="fieldType" value="Field"/></prefs></data>`
  );
}

/** Stores Zotero document prefs as custom properties ZOTERO_PREF_1..n (255-char chunks, as Zotero does). */
export function setZoteroPrefs(t: Target, styleId: string, hasBibliography: boolean) {
  const xml = zoteroPrefsXml(styleId, hasBibliography);
  const props: Record<string, { type: string; value: string }> = {};
  for (let i = 0; i * 255 < xml.length; i++) props[`ZOTERO_PREF_${i + 1}`] = S(xml.slice(i * 255, (i + 1) * 255));
  return sendUnoCommand(t, ".uno:SetDocumentProperties", {
    UpdatedProperties: {
      type: "[]com.sun.star.beans.PropertyValue",
      value: {
        NamePrefix: S("ZOTERO_PREF_"),
        UserDefinedProperties: { type: "[]com.sun.star.beans.PropertyValue", value: props },
      },
    },
  });
}

export function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
