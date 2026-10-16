/**
 * Minimal PostMessage sender interface for communicating with Collabora Online iframe.
 */
export interface CollaboraPostMessageSender {
  postMessage(message: unknown, targetOrigin?: string): void;
}

/**
 * Minimal event listener interface for receiving messages from Collabora Online iframe.
 */
export interface CollaboraEventListenerRemover {
  remove(): void;
}
