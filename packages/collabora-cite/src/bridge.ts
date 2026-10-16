import type {
  CallPythonScriptMessage,
  SendUnoCommandMessage,
  CollaboraMessage,
  ZoteroCitationPayload,
  ZoteroBibliographyPayload,
  ZoteroDocumentPrefs,
} from "./types.js";
import type { CollaboraPostMessageSender } from "./postMessageInterface.js";
import {
  createLibreOfficeCitationMarkName,
  createLibreOfficeBibliographyMarkName,
  createLibreOfficeDocumentPrefsMarkName,
  generateRandomSuffix,
} from "./fields.js";

export const DEFAULT_COLLABORA_SCRIPT = "zotero_collabora.py";

/**
 * Creates a generic CallPythonScript PostMessage payload for Collabora Online.
 */
export function createCallPythonScriptPayload(
  scriptFile: string,
  funcName: string,
  args: Record<string, unknown>,
): CallPythonScriptMessage {
  const values: Record<string, { type: string; value: unknown }> = {};
  for (const [key, val] of Object.entries(args)) {
    let type: string = typeof val;
    if (type === "number") {
      type = Number.isInteger(val) ? "int" : "float";
    } else if (type === "boolean") {
      type = "bool";
    } else if (type === "object" && val !== null) {
      type = "string";
    }
    values[key] = {
      type,
      value: typeof val === "object" && val !== null ? JSON.stringify(val) : val,
    };
  }

  return {
    MessageId: "CallPythonScript",
    SendTime: Date.now(),
    ScriptFile: scriptFile,
    Function: funcName,
    Values: values,
  };
}

/**
 * Creates a generic Send_UNO_Command PostMessage payload for Collabora Online.
 */
export function createSendUnoCommandPayload(
  command: string,
  args?: Record<string, unknown>,
): SendUnoCommandMessage {
  const values: { Command: string; Args?: Record<string, { type: string; value: unknown }> } = {
    Command: command.startsWith(".uno:") ? command : `.uno:${command}`,
  };

  if (args) {
    const formattedArgs: Record<string, { type: string; value: unknown }> = {};
    for (const [key, val] of Object.entries(args)) {
      let type: string = typeof val;
      if (type === "number") {
        type = Number.isInteger(val) ? "int" : "float";
      } else if (type === "boolean") {
        type = "bool";
      }
      formattedArgs[key] = {
        type,
        value: typeof val === "object" && val !== null ? JSON.stringify(val) : val,
      };
    }
    values.Args = formattedArgs;
  }

  return {
    MessageId: "Send_UNO_Command",
    Values: values,
  };
}

/**
 * Build PostMessage payload to insert a new in-text citation via the LibreOffice Python macro.
 */
export function buildInsertCitationMessage(
  citationPayload: ZoteroCitationPayload,
  formattedText: string,
  options?: {
    scriptFile?: string;
    rndSuffix?: string;
  },
): CallPythonScriptMessage {
  const scriptFile = options?.scriptFile ?? DEFAULT_COLLABORA_SCRIPT;
  const rndSuffix = options?.rndSuffix ?? generateRandomSuffix();
  const markName = createLibreOfficeCitationMarkName(citationPayload, rndSuffix);

  return createCallPythonScriptPayload(scriptFile, "insert_citation", {
    citationJson: JSON.stringify(citationPayload),
    formattedText,
    markName,
    rndSuffix,
  });
}

/**
 * Build PostMessage payload to update an existing in-text citation.
 */
export function buildUpdateCitationMessage(
  markName: string,
  citationPayload: ZoteroCitationPayload,
  formattedText: string,
  options?: {
    scriptFile?: string;
    newMarkName?: string;
  },
): CallPythonScriptMessage {
  const scriptFile = options?.scriptFile ?? DEFAULT_COLLABORA_SCRIPT;
  const newMarkName =
    options?.newMarkName ??
    createLibreOfficeCitationMarkName(citationPayload, generateRandomSuffix());

  return createCallPythonScriptPayload(scriptFile, "update_citation", {
    markName,
    newMarkName,
    citationJson: JSON.stringify(citationPayload),
    formattedText,
  });
}

/**
 * Build PostMessage payload to insert the bibliography via the LibreOffice Python macro.
 */
export function buildInsertBibliographyMessage(
  formattedText: string,
  options?: {
    scriptFile?: string;
    biblPayload?: ZoteroBibliographyPayload;
    rndSuffix?: string;
  },
): CallPythonScriptMessage {
  const scriptFile = options?.scriptFile ?? DEFAULT_COLLABORA_SCRIPT;
  const rndSuffix = options?.rndSuffix ?? generateRandomSuffix();
  const markName = createLibreOfficeBibliographyMarkName(options?.biblPayload, rndSuffix);

  return createCallPythonScriptPayload(scriptFile, "insert_bibliography", {
    formattedText,
    markName,
    biblJson: JSON.stringify(options?.biblPayload ?? { uncited: [], omitted: [], custom: [] }),
    rndSuffix,
  });
}

/**
 * Build PostMessage payload to update an existing bibliography.
 */
export function buildUpdateBibliographyMessage(
  markName: string,
  formattedText: string,
  options?: {
    scriptFile?: string;
    newMarkName?: string;
  },
): CallPythonScriptMessage {
  const scriptFile = options?.scriptFile ?? DEFAULT_COLLABORA_SCRIPT;
  return createCallPythonScriptPayload(scriptFile, "update_bibliography", {
    markName,
    newMarkName: options?.newMarkName ?? markName,
    formattedText,
  });
}

/**
 * Build PostMessage payload to set document preferences in LibreOffice.
 */
export function buildSetDocumentPrefsMessage(
  prefs: ZoteroDocumentPrefs,
  options?: {
    scriptFile?: string;
    rndSuffix?: string;
  },
): CallPythonScriptMessage {
  const scriptFile = options?.scriptFile ?? DEFAULT_COLLABORA_SCRIPT;
  const rndSuffix = options?.rndSuffix ?? generateRandomSuffix();
  const markName = createLibreOfficeDocumentPrefsMarkName(prefs, rndSuffix);

  return createCallPythonScriptPayload(scriptFile, "set_document_prefs", {
    prefJson: JSON.stringify(prefs),
    markName,
  });
}

/**
 * Build PostMessage payload to request all Zotero ReferenceMarks and bookmarks from the document.
 */
export function buildGetDocumentFieldsMessage(options?: {
  scriptFile?: string;
}): CallPythonScriptMessage {
  const scriptFile = options?.scriptFile ?? DEFAULT_COLLABORA_SCRIPT;
  return createCallPythonScriptPayload(scriptFile, "get_document_fields", {});
}

/**
 * UNO command payload: .uno:InsertField / .uno:InsertReferenceField.
 */
export function buildUnoInsertFieldMessage(
  typeName: string,
  content: string,
): SendUnoCommandMessage {
  return createSendUnoCommandPayload(".uno:InsertField", {
    TypeName: typeName,
    Content: content,
  });
}

/**
 * UNO command payload: .uno:InsertBookmark.
 */
export function buildUnoInsertBookmarkMessage(bookmarkName: string): SendUnoCommandMessage {
  return createSendUnoCommandPayload(".uno:InsertBookmark", {
    Bookmark: bookmarkName,
  });
}

/**
 * High-level bridge helper to communicate with Collabora Online via PostMessage.
 */
export class CollaboraBridge {
  private sender: CollaboraPostMessageSender;
  private targetOrigin: string;
  private scriptFile: string;

  constructor(
    sender: CollaboraPostMessageSender,
    targetOrigin = "*",
    scriptFile = DEFAULT_COLLABORA_SCRIPT,
  ) {
    this.sender = sender;
    this.targetOrigin = targetOrigin;
    this.scriptFile = scriptFile;
  }

  /**
   * Serialize and send a Collabora PostMessage payload.
   */
  public send(message: CollaboraMessage): void {
    const payload = typeof message === "string" ? message : JSON.stringify(message);
    this.sender.postMessage(payload, this.targetOrigin);
  }

  public insertCitation(
    citationPayload: ZoteroCitationPayload,
    formattedText: string,
    rndSuffix?: string,
  ): CallPythonScriptMessage {
    const msg = buildInsertCitationMessage(citationPayload, formattedText, {
      scriptFile: this.scriptFile,
      rndSuffix,
    });
    this.send(msg);
    return msg;
  }

  public updateCitation(
    markName: string,
    citationPayload: ZoteroCitationPayload,
    formattedText: string,
  ): CallPythonScriptMessage {
    const msg = buildUpdateCitationMessage(markName, citationPayload, formattedText, {
      scriptFile: this.scriptFile,
    });
    this.send(msg);
    return msg;
  }

  public insertBibliography(
    formattedText: string,
    biblPayload?: ZoteroBibliographyPayload,
  ): CallPythonScriptMessage {
    const msg = buildInsertBibliographyMessage(formattedText, {
      scriptFile: this.scriptFile,
      biblPayload,
    });
    this.send(msg);
    return msg;
  }

  public updateBibliography(markName: string, formattedText: string): CallPythonScriptMessage {
    const msg = buildUpdateBibliographyMessage(markName, formattedText, {
      scriptFile: this.scriptFile,
    });
    this.send(msg);
    return msg;
  }

  public setDocumentPrefs(prefs: ZoteroDocumentPrefs): CallPythonScriptMessage {
    const msg = buildSetDocumentPrefsMessage(prefs, { scriptFile: this.scriptFile });
    this.send(msg);
    return msg;
  }

  public getDocumentFields(): CallPythonScriptMessage {
    const msg = buildGetDocumentFieldsMessage({ scriptFile: this.scriptFile });
    this.send(msg);
    return msg;
  }
}
