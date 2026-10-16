// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, cleanup } from "@testing-library/react";
import {
  postToCollabora,
  sendHostPostmessageReady,
  sendUnoCommand,
  sendActionSave,
  useCollaboraPostMessage,
} from "../src/collabora/postMessage.js";
import { CollaboraFrame } from "../src/collabora/CollaboraFrame.js";
import { CollaboraEditorPage } from "../src/collabora/CollaboraEditorPage.js";
import { useRef } from "react";

afterEach(cleanup);

describe("Collabora PostMessage Protocol & Utilities", () => {
  it("postToCollabora safely stringifies message and posts to target window", () => {
    const mockPostMessage = vi.fn();
    const mockWindow = { postMessage: mockPostMessage } as unknown as Window;

    const result = postToCollabora(
      mockWindow,
      { MessageId: "Test_Message", Values: { key: "value" } },
      "http://collabora:9980",
    );

    expect(result).toBe(true);
    expect(mockPostMessage).toHaveBeenCalledTimes(1);
    expect(mockPostMessage).toHaveBeenCalledWith(
      JSON.stringify({ MessageId: "Test_Message", Values: { key: "value" } }),
      "http://collabora:9980",
    );
  });

  it("sendHostPostmessageReady posts Host_PostmessageReady", () => {
    const mockPostMessage = vi.fn();
    const mockWindow = { postMessage: mockPostMessage } as unknown as Window;

    sendHostPostmessageReady(mockWindow, "http://localhost:9980");

    expect(mockPostMessage).toHaveBeenCalledWith(
      JSON.stringify({ MessageId: "Host_PostmessageReady", Values: {} }),
      "http://localhost:9980",
    );
  });

  it("sendUnoCommand formats UNO command with JSON arguments", () => {
    const mockPostMessage = vi.fn();
    const mockWindow = { postMessage: mockPostMessage } as unknown as Window;

    sendUnoCommand(mockWindow, ".uno:Save", { DontTerminateEdit: true });

    expect(mockPostMessage).toHaveBeenCalledWith(
      JSON.stringify({
        MessageId: "Send_UNO_Command",
        Values: {
          Command: ".uno:Save",
          Args: { type: "json", value: { DontTerminateEdit: true } },
        },
      }),
      "*",
    );
  });

  it("sendActionSave formats Action_Save command", () => {
    const mockPostMessage = vi.fn();
    const mockWindow = { postMessage: mockPostMessage } as unknown as Window;

    sendActionSave(mockWindow, true);

    expect(mockPostMessage).toHaveBeenCalledWith(
      JSON.stringify({
        MessageId: "Action_Save",
        Values: {
          DontTerminateEdit: true,
          DontSaveIfUnmodified: true,
        },
      }),
      "*",
    );
  });
});

describe("useCollaboraPostMessage Hook", () => {
  function TestHookComponent(props: {
    collaboraOrigin?: string;
    onLoadingStatus?: (status: string) => void;
    onDocumentLoaded?: () => void;
    onSaveResponse?: (success: boolean) => void;
  }) {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const { isDocumentLoaded, loadingStatus } = useCollaboraPostMessage({
      iframeRef,
      collaboraOrigin: props.collaboraOrigin,
      onLoadingStatus: props.onLoadingStatus,
      onDocumentLoaded: props.onDocumentLoaded,
      onSaveResponse: props.onSaveResponse,
    });

    return (
      <div>
        <span data-testid="status">{loadingStatus}</span>
        <span data-testid="loaded">{isDocumentLoaded ? "yes" : "no"}</span>
      </div>
    );
  }

  it("processes App_LoadingStatus and Document_Loaded events", () => {
    const onLoadingStatus = vi.fn();
    const onDocumentLoaded = vi.fn();

    render(
      <TestHookComponent
        onLoadingStatus={onLoadingStatus}
        onDocumentLoaded={onDocumentLoaded}
      />,
    );

    expect(screen.getByTestId("status").textContent).toBe("init");
    expect(screen.getByTestId("loaded").textContent).toBe("no");

    // Dispatch App_LoadingStatus
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: JSON.stringify({
            MessageId: "App_LoadingStatus",
            Values: { Status: "Loading_Components" },
          }),
          origin: "http://localhost:9980",
        }),
      );
    });

    expect(screen.getByTestId("status").textContent).toBe("Loading_Components");
    expect(onLoadingStatus).toHaveBeenCalledWith("Loading_Components", {
      Status: "Loading_Components",
    });

    // Dispatch Document_Loaded
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: JSON.stringify({
            MessageId: "Document_Loaded",
            Values: {},
          }),
          origin: "http://localhost:9980",
        }),
      );
    });

    expect(screen.getByTestId("status").textContent).toBe("Document_Loaded");
    expect(screen.getByTestId("loaded").textContent).toBe("yes");
    expect(onDocumentLoaded).toHaveBeenCalledTimes(1);
  });

  it("verifies and rejects messages from mismatched origin when collaboraOrigin is specified", () => {
    const onDocumentLoaded = vi.fn();

    render(
      <TestHookComponent
        collaboraOrigin="http://trusted-collabora.org"
        onDocumentLoaded={onDocumentLoaded}
      />,
    );

    // Message from evil origin
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: JSON.stringify({
            MessageId: "Document_Loaded",
          }),
          origin: "http://attacker.com",
        }),
      );
    });

    // Should be ignored
    expect(onDocumentLoaded).not.toHaveBeenCalled();
    expect(screen.getByTestId("loaded").textContent).toBe("no");

    // Message from trusted origin
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: JSON.stringify({
            MessageId: "Document_Loaded",
          }),
          origin: "http://trusted-collabora.org",
        }),
      );
    });

    expect(onDocumentLoaded).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("loaded").textContent).toBe("yes");
  });
});

describe("CollaboraFrame Component", () => {
  it("renders form targeting the iframe with access_token and ttl", () => {
    const formSubmitSpy = vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => {});

    render(
      <CollaboraFrame
        actionUrl="http://localhost:9980/browser/dist/cool.html?WOPISrc=http://server:3000/wopi/files/doc1"
        accessToken="signed-token-12345"
        accessTokenTtl={1729000000000}
      />,
    );

    const form = screen.getByTestId("collabora-form") as HTMLFormElement;
    expect(form).toBeDefined();
    expect(form.action).toContain("cool.html");
    expect(form.method.toLowerCase()).toBe("post");

    const iframe = screen.getByTestId("collabora-iframe") as HTMLIFrameElement;
    expect(iframe).toBeDefined();
    expect(form.target).toBe(iframe.name);

    const tokenInput = form.querySelector('input[name="access_token"]') as HTMLInputElement;
    expect(tokenInput.value).toBe("signed-token-12345");

    const ttlInput = form.querySelector('input[name="access_token_ttl"]') as HTMLInputElement;
    expect(ttlInput.value).toBe("1729000000000");

    expect(formSubmitSpy).toHaveBeenCalled();
    formSubmitSpy.mockRestore();
  });

  it("sends Host_PostmessageReady when iframe triggers load event", () => {
    const onFrameReady = vi.fn();
    const mockPostMessage = vi.fn();

    const { getByTestId } = render(
      <CollaboraFrame
        actionUrl="http://localhost:9980/browser/cool.html"
        accessToken="test-token"
        accessTokenTtl={123456}
        onFrameReady={onFrameReady}
      />,
    );

    const iframe = getByTestId("collabora-iframe") as HTMLIFrameElement;
    // Mock contentWindow on iframe
    Object.defineProperty(iframe, "contentWindow", {
      value: { postMessage: mockPostMessage },
      writable: true,
    });

    fireEvent.load(iframe);

    expect(onFrameReady).toHaveBeenCalledTimes(1);
    expect(mockPostMessage).toHaveBeenCalledWith(
      JSON.stringify({ MessageId: "Host_PostmessageReady", Values: {} }),
      "*",
    );
  });
});

describe("CollaboraEditorPage Component", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            actionUrl: "http://localhost:9980/browser/cool.html?WOPISrc=http%3A%2F%2Fserver%3A3000%2Fwopi%2Ffiles%2Fdoc-1",
            wopiSrc: "http://localhost:3000/wopi/files/doc-1",
            accessToken: "token-abc",
            accessTokenTtl: Date.now() + 3600000,
            collaboraUrl: "http://localhost:9980",
          }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders editor page with title, Collabora badge, and CollaboraFrame", async () => {
    render(
      <CollaboraEditorPage
        documentId="doc-test-page"
        documentTitle="My Quantum Research Paper"
      />,
    );

    expect(screen.getByText("My Quantum Research Paper")).toBeDefined();
    expect(screen.getByText("Collabora Online (CODE)")).toBeDefined();

    // Eventually iframe container is rendered
    expect(await screen.findByTestId("collabora-iframe")).toBeDefined();
  });
});
