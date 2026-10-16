import { XmlComponent, XmlAttributeComponent, Run, type ParagraphChild } from "docx";
import type { ZoteroCitationPayload } from "./types.js";

class FldCharAttributes extends XmlAttributeComponent<{ fldCharType: string }> {
  protected readonly xmlKeys = { fldCharType: "w:fldCharType" };
}

/**
 * WordprocessingML complex field boundary:
 * <w:fldChar w:fldCharType="begin|separate|end"/>
 */
export class FldChar extends XmlComponent {
  constructor(type: "begin" | "separate" | "end") {
    super("w:fldChar");
    this.root.push(new FldCharAttributes({ fldCharType: type }));
  }
}

class InstrTextAttributes extends XmlAttributeComponent<{ space: string }> {
  protected readonly xmlKeys = { space: "xml:space" };
}

/**
 * WordprocessingML field instruction text:
 * <w:instrText xml:space="preserve"> ... </w:instrText>
 */
export class InstrText extends XmlComponent {
  constructor(instruction: string) {
    super("w:instrText");
    this.root.push(new InstrTextAttributes({ space: "preserve" }));
    this.root.push(instruction);
  }
}

/**
 * Creates the sequence of runs for a native Zotero in-text citation complex field:
 *
 * <w:r><w:fldChar w:fldCharType="begin"/></w:r>
 * <w:r><w:instrText xml:space="preserve"> ADDIN ZOTERO_ITEM CSL_CITATION {...} </w:instrText></w:r>
 * <w:r><w:fldChar w:fldCharType="separate"/></w:r>
 * <w:r><w:t>Formatted Citation</w:t></w:r>
 * <w:r><w:fldChar w:fldCharType="end"/></w:r>
 */
export function createZoteroCitationFieldRuns(
  payload: ZoteroCitationPayload,
  formattedText: string,
): ParagraphChild[] {
  const instruction = ` ADDIN ZOTERO_ITEM CSL_CITATION ${JSON.stringify(payload)} `;
  return [
    new Run({ children: [new FldChar("begin")] }),
    new Run({ children: [new InstrText(instruction)] }),
    new Run({ children: [new FldChar("separate")] }),
    new Run({ text: formattedText }),
    new Run({ children: [new FldChar("end")] }),
  ];
}

/**
 * Creates the runs to begin a Zotero bibliography field:
 * ADDIN ZOTERO_BIBL {"custom":[]} CSL_BIBLIOGRAPHY
 */
export function createBibliographyBeginRuns(
  customPayload: Record<string, unknown> = { custom: [] },
): ParagraphChild[] {
  const instruction = ` ADDIN ZOTERO_BIBL ${JSON.stringify(customPayload)} CSL_BIBLIOGRAPHY `;
  return [
    new Run({ children: [new FldChar("begin")] }),
    new Run({ children: [new InstrText(instruction)] }),
    new Run({ children: [new FldChar("separate")] }),
  ];
}

/**
 * Creates the run to close a Zotero bibliography field.
 */
export function createBibliographyEndRuns(): ParagraphChild[] {
  return [new Run({ children: [new FldChar("end")] })];
}
