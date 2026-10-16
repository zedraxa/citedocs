import type { CSLItem } from "@citedocs/shared";
import { CollaboraCSLEngine } from "./engine.js";
import { parseDocumentFields } from "./parser.js";
import {
  createWordCitationFieldCode,
  createLibreOfficeCitationMarkName,
  createWordBibliographyFieldCode,
  createLibreOfficeBibliographyMarkName,
  generateRandomSuffix,
} from "./fields.js";
import type {
  ParsedDocumentField,
  DocumentRefreshResult,
  RefreshedCitation,
  RefreshedBibliography,
  CollaboraMessage,
  ZoteroCitationPayload,
} from "./types.js";

export interface RefreshDocumentOptions {
  styleId: string;
  locale?: string;
  extraItems?: CSLItem[];
  generatePostMessages?: boolean;
  scriptFileName?: string;
}

/**
 * Refreshes all citations and bibliography in a document when switching style or locale.
 */
export function refreshDocument(
  fields: (string | ParsedDocumentField | { name: string; text?: string })[],
  options: RefreshDocumentOptions,
): DocumentRefreshResult {
  const styleId = options.styleId;
  const locale = options.locale ?? "en-US";
  const scriptFileName = options.scriptFileName ?? "zotero_collabora.py";

  // Parse any raw string inputs
  const parsedFields: ParsedDocumentField[] = fields.map((f) => {
    if (typeof f === "string") {
      return parseDocumentFields([f])[0];
    }
    if ("rawCode" in f && "type" in f) {
      return f as ParsedDocumentField;
    }
    return parseDocumentFields([f as { name: string; text?: string }])[0];
  });

  // Extract all citation fields in document order
  const citationFields = parsedFields.filter(
    (f): f is ParsedDocumentField & { citation: ZoteroCitationPayload } =>
      f.type === "citation" && Boolean(f.citation),
  );

  // Extract bibliography field if present
  const biblField = parsedFields.find((f) => f.type === "bibliography");

  // Collect items
  const itemMap = new Map<string, CSLItem>();
  if (options.extraItems) {
    for (const item of options.extraItems) {
      itemMap.set(String(item.id), item);
    }
  }

  for (const cf of citationFields) {
    for (const item of cf.citation.citationItems) {
      if (item.itemData && typeof item.itemData === "object") {
        itemMap.set(String(item.id), {
          ...item.itemData,
          id: String(item.id),
        } as CSLItem);
      }
    }
  }

  // Initialize engine with target style and locale
  const engine = new CollaboraCSLEngine(styleId, locale, Array.from(itemMap.values()));

  // Process clusters through engine
  const clusters = citationFields.map((cf) => cf.citation);
  const engineResults = engine.processCitationClusters(clusters);

  const refreshedCitations: RefreshedCitation[] = [];
  const postMessages: CollaboraMessage[] = [];

  for (let i = 0; i < citationFields.length; i++) {
    const cf = citationFields[i];
    const engineRes = engineResults[i];

    const newFormatted = engineRes?.formattedCitation || cf.citation.properties.formattedCitation;
    const newPlain = engineRes?.plainCitation || cf.citation.properties.plainCitation || "";

    const updatedPayload: ZoteroCitationPayload = {
      ...cf.citation,
      properties: {
        ...cf.citation.properties,
        formattedCitation: newFormatted,
        plainCitation: newPlain,
      },
    };

    const isWord = cf.format === "word";
    const rndSuffix = cf.rndSuffix || generateRandomSuffix();

    let fieldCode: string;
    let newMarkName: string | undefined;

    if (isWord) {
      fieldCode = createWordCitationFieldCode(updatedPayload);
    } else {
      newMarkName = createLibreOfficeCitationMarkName(updatedPayload, rndSuffix);
      fieldCode = newMarkName;
    }

    refreshedCitations.push({
      citationID: cf.citation.citationID,
      markName: newMarkName || cf.markName,
      fieldCode,
      newPayload: updatedPayload,
      formattedText: newFormatted,
      plainText: newPlain,
    });

    if (options.generatePostMessages !== false) {
      // Build CallPythonScript message for LibreOffice / Collabora
      postMessages.push({
        MessageId: "CallPythonScript",
        SendTime: Date.now(),
        ScriptFile: scriptFileName,
        Function: "update_citation",
        Values: {
          markName: { type: "string", value: cf.markName || fieldCode },
          newMarkName: { type: "string", value: newMarkName || fieldCode },
          citationJson: { type: "string", value: JSON.stringify(updatedPayload) },
          formattedText: { type: "string", value: newPlain },
        },
      });
    }
  }

  // Handle bibliography
  let refreshedBibliography: RefreshedBibliography | undefined;
  if (biblField || citationFields.length > 0) {
    const bibOutput = engine.makeBibliography();
    const isWord = biblField?.format === "word";
    const rndSuffix = biblField?.rndSuffix || generateRandomSuffix();

    let bibFieldCode: string;
    let newBibMarkName: string | undefined;

    if (isWord) {
      bibFieldCode = createWordBibliographyFieldCode(biblField?.bibliography);
    } else {
      newBibMarkName = createLibreOfficeBibliographyMarkName(biblField?.bibliography, rndSuffix);
      bibFieldCode = newBibMarkName;
    }

    refreshedBibliography = {
      entries: bibOutput.entries,
      html: bibOutput.html,
      text: bibOutput.text,
      fieldCode: bibFieldCode,
      markName: newBibMarkName || biblField?.markName,
    };

    if (options.generatePostMessages !== false && biblField) {
      postMessages.push({
        MessageId: "CallPythonScript",
        SendTime: Date.now(),
        ScriptFile: scriptFileName,
        Function: "update_bibliography",
        Values: {
          markName: { type: "string", value: biblField.markName || bibFieldCode },
          newMarkName: { type: "string", value: newBibMarkName || bibFieldCode },
          formattedText: { type: "string", value: bibOutput.text },
        },
      });
    }
  }

  return {
    styleId,
    locale,
    citations: refreshedCitations,
    bibliography: refreshedBibliography,
    postMessages,
  };
}
