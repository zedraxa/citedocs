import { useEffect, useCallback, useRef, useState } from "react";

export interface CollaboraIncomingMessage {
  MessageId: string;
  Values?: Record<string, unknown> & {
    Status?: string;
    success?: boolean;
    [key: string]: unknown;
  };
  SendTime?: number;
}

export interface CollaboraOutgoingMessage {
  MessageId: string;
  Values?: Record<string, unknown>;
}

export interface CollaboraPostMessageHandlers {
  onLoadingStatus?: (status: string, rawValues?: Record<string, unknown>) => void;
  onDocumentLoaded?: () => void;
  onSaveResponse?: (success: boolean) => void;
  onMessage?: (
    messageId: string,
    values: Record<string, unknown>,
    event: MessageEvent,
  ) => void;
}

export interface UseCollaboraPostMessageOptions extends CollaboraPostMessageHandlers {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  collaboraOrigin?: string;
}

/**
 * Sends a typed postMessage to the Collabora Online iframe window.
 */
export function postToCollabora(
  target: Window | HTMLIFrameElement | null,
  message: CollaboraOutgoingMessage,
  targetOrigin = "*",
): boolean {
  if (!target) return false;

  const targetWindow = "contentWindow" in target ? target.contentWindow : target;
  if (!targetWindow) return false;

  try {
    const payload = JSON.stringify(message);
    targetWindow.postMessage(payload, targetOrigin);
    return true;
  } catch {
    return false;
  }
}

/**
 * Notifies Collabora Online that the host window is ready to receive postMessages.
 */
export function sendHostPostmessageReady(
  target: Window | HTMLIFrameElement | null,
  targetOrigin = "*",
): boolean {
  return postToCollabora(
    target,
    {
      MessageId: "Host_PostmessageReady",
      Values: {},
    },
    targetOrigin,
  );
}

/**
 * Sends a UNO command to Collabora Online (e.g. .uno:Save, .uno:InsertText).
 */
export function sendUnoCommand(
  target: Window | HTMLIFrameElement | null,
  command: string,
  args?: Record<string, unknown>,
  targetOrigin = "*",
): boolean {
  return postToCollabora(
    target,
    {
      MessageId: "Send_UNO_Command",
      Values: {
        Command: command,
        Args: args ? { type: "json", value: args } : undefined,
      },
    },
    targetOrigin,
  );
}

/**
 * Sends an Action_Save command to Collabora Online to trigger a document save.
 */
export function sendActionSave(
  target: Window | HTMLIFrameElement | null,
  dontTerminateEdit = true,
  targetOrigin = "*",
): boolean {
  return postToCollabora(
    target,
    {
      MessageId: "Action_Save",
      Values: {
        DontTerminateEdit: dontTerminateEdit,
        DontSaveIfUnmodified: true,
      },
    },
    targetOrigin,
  );
}

/**
 * Reusable React hook for communicating with Collabora Online via postMessage.
 * Includes origin verification, lifecycle parsing (LoadingStatus, Document_Loaded),
 * and helper dispatchers.
 */
export function useCollaboraPostMessage(options: UseCollaboraPostMessageOptions) {
  const { iframeRef, collaboraOrigin, onLoadingStatus, onDocumentLoaded, onSaveResponse, onMessage } =
    options;

  const [isDocumentLoaded, setIsDocumentLoaded] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string>("init");

  // Keep callback refs stable to prevent unnecessary re-subscriptions
  const handlersRef = useRef({
    onLoadingStatus,
    onDocumentLoaded,
    onSaveResponse,
    onMessage,
  });
  handlersRef.current = {
    onLoadingStatus,
    onDocumentLoaded,
    onSaveResponse,
    onMessage,
  };

  const dispatchToFrame = useCallback(
    (messageId: string, values: Record<string, unknown> = {}) => {
      return postToCollabora(
        iframeRef.current,
        { MessageId: messageId, Values: values },
        collaboraOrigin || "*",
      );
    },
    [iframeRef, collaboraOrigin],
  );

  const save = useCallback(
    (dontTerminateEdit = true) => {
      return sendActionSave(iframeRef.current, dontTerminateEdit, collaboraOrigin || "*");
    },
    [iframeRef, collaboraOrigin],
  );

  const executeUno = useCallback(
    (command: string, args?: Record<string, unknown>) => {
      return sendUnoCommand(iframeRef.current, command, args, collaboraOrigin || "*");
    },
    [iframeRef, collaboraOrigin],
  );

  const notifyReady = useCallback(() => {
    return sendHostPostmessageReady(iframeRef.current, collaboraOrigin || "*");
  }, [iframeRef, collaboraOrigin]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleWindowMessage = (event: MessageEvent) => {
      // 1. Origin verification
      if (collaboraOrigin && collaboraOrigin !== "*") {
        const expectedOrigin = new URL(collaboraOrigin, window.location.origin).origin;
        if (event.origin !== expectedOrigin) {
          // Ignore message from untrusted or mismatched origin
          return;
        }
      }

      // 2. Parse payload
      let parsed: CollaboraIncomingMessage;
      if (typeof event.data === "string") {
        try {
          parsed = JSON.parse(event.data) as CollaboraIncomingMessage;
        } catch {
          // Not a JSON postMessage (e.g. React devtools, browser extension)
          return;
        }
      } else if (typeof event.data === "object" && event.data !== null && "MessageId" in event.data) {
        parsed = event.data as CollaboraIncomingMessage;
      } else {
        return;
      }

      if (!parsed || !parsed.MessageId) return;

      const messageId = parsed.MessageId;
      const values = parsed.Values || {};

      // 3. Handle App_LoadingStatus
      if (messageId === "App_LoadingStatus") {
        const status = (values.Status as string) || "";
        setLoadingStatus(status);
        handlersRef.current.onLoadingStatus?.(status, values);

        if (status === "Document_Loaded") {
          setIsDocumentLoaded(true);
          handlersRef.current.onDocumentLoaded?.();
        }
      }

      // 4. Handle Document_Loaded / Doc_Loaded
      if (messageId === "Document_Loaded" || messageId === "Doc_Loaded") {
        setIsDocumentLoaded(true);
        setLoadingStatus("Document_Loaded");
        handlersRef.current.onDocumentLoaded?.();
      }

      // 5. Handle Action_Save_Resp
      if (messageId === "Action_Save_Resp") {
        const success = values.success !== false;
        handlersRef.current.onSaveResponse?.(success);
      }

      // 6. Generic handler
      handlersRef.current.onMessage?.(messageId, values, event);
    };

    window.addEventListener("message", handleWindowMessage);
    return () => {
      window.removeEventListener("message", handleWindowMessage);
    };
  }, [collaboraOrigin]);

  return {
    isDocumentLoaded,
    loadingStatus,
    postMessage: dispatchToFrame,
    notifyReady,
    save,
    executeUno,
  };
}
