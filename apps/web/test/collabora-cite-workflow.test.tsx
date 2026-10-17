// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { StyleSelector } from "../src/collabora/StyleSelector.js";
import { CitationEditorModal } from "../src/collabora/CitationEditorModal.js";
import {
  DocumentCitationsDrawer,
  type DocumentCitationItem,
} from "../src/collabora/DocumentCitationsDrawer.js";
import { CollaboraEditorPage } from "../src/collabora/CollaboraEditorPage.js";
import type { CSLItem } from "@citedocs/shared";
import { createZoteroCitationPayload } from "@citedocs/collabora-cite";

afterEach(cleanup);

const MOCK_CSL_LIBBY: CSLItem = {
  id: "item-101",
  type: "article-journal",
  title: "The changing landscape of atherosclerosis",
  author: [{ family: "Libby", given: "Peter" }],
  issued: { "date-parts": [[2021]] },
};

const MOCK_CSL_KAHNEMAN: CSLItem = {
  id: "item-102",
  type: "book",
  title: "Thinking, Fast and Slow",
  author: [{ family: "Kahneman", given: "Daniel" }],
  issued: { "date-parts": [[2011]] },
};

describe("StyleSelector Component", () => {
  it("renders active style button and opens dropdown with popular styles", () => {
    const onStyleChange = vi.fn();

    render(
      <StyleSelector
        currentStyleId="apa"
        onStyleChange={onStyleChange}
      />,
    );

    const btn = screen.getByTestId("csl-style-selector-btn");
    expect(btn.textContent).toContain("APA 7th");

    fireEvent.click(btn);
    expect(screen.getByTestId("csl-style-dropdown")).toBeDefined();

    // Check popular styles are present
    expect(screen.getByTestId("csl-style-option-apa")).toBeDefined();
    expect(screen.getByTestId("csl-style-option-ieee")).toBeDefined();
    expect(screen.getByTestId("csl-style-option-chicago-author-date")).toBeDefined();
    expect(screen.getByTestId("csl-style-option-vancouver")).toBeDefined();
    expect(screen.getByTestId("csl-style-option-harvard-cite-them-right")).toBeDefined();
    expect(screen.getByTestId("csl-style-option-modern-language-association")).toBeDefined();

    // Select IEEE
    fireEvent.click(screen.getByTestId("csl-style-option-ieee"));
    expect(onStyleChange).toHaveBeenCalledWith("ieee", undefined);
  });

  it("filters styles when typing in the search box", async () => {
    const onStyleChange = vi.fn();

    render(
      <StyleSelector
        currentStyleId="apa"
        onStyleChange={onStyleChange}
      />,
    );

    fireEvent.click(screen.getByTestId("csl-style-selector-btn"));
    const searchInput = screen.getByTestId("csl-style-search-input");

    fireEvent.change(searchInput, { target: { value: "vancouver" } });

    await waitFor(() => {
      expect(screen.getByTestId("csl-style-option-vancouver")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("csl-style-option-vancouver"));
    expect(onStyleChange).toHaveBeenCalledWith("vancouver", undefined);
  });
});

describe("CitationEditorModal Component", () => {
  it("renders in insert mode and updates live CSL preview on locator/suppressAuthor changes", () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <CitationEditorModal
        isOpen={true}
        mode="insert"
        currentStyleId="apa"
        availableItems={[MOCK_CSL_LIBBY, MOCK_CSL_KAHNEMAN]}
        onSave={onSave}
        onClose={onClose}
      />,
    );

    expect(screen.getByTestId("citation-editor-modal")).toBeDefined();
    expect(screen.getAllByText("Atıf Ekle").length).toBeGreaterThan(0);

    const preview = screen.getByTestId("citation-live-preview");
    expect(preview.textContent).toContain("Libby, 2021");

    // Change locator value
    const locatorInput = screen.getByTestId("locator-value-input");
    fireEvent.change(locatorInput, { target: { value: "525" } });
    expect(preview.textContent).toContain("525");

    // Change prefix
    const prefixInput = screen.getByTestId("prefix-input");
    fireEvent.change(prefixInput, { target: { value: "see " } });
    expect(preview.textContent).toContain("see");

    // Toggle suppress author
    const suppressCheckbox = screen.getByTestId("suppress-author-checkbox");
    fireEvent.click(suppressCheckbox);
    expect(preview.textContent).not.toContain("Libby");
    expect(preview.textContent).toContain("2021");

    // Save citation
    const saveBtn = screen.getByTestId("save-citation-modal-btn");
    fireEvent.click(saveBtn);

    expect(onSave).toHaveBeenCalledTimes(1);
    const [payload, formattedText] = onSave.mock.calls[0];
    expect(payload.citationItems[0].id).toBe("item-101");
    expect(payload.citationItems[0].locator).toBe("525");
    expect(payload.citationItems[0].prefix).toBe("see ");
    expect(payload.citationItems[0].suppressAuthor).toBe(true);
    expect(formattedText).toContain("2021");
    expect(onClose).toHaveBeenCalled();
  });

  it("renders in edit mode and allows deleting citation", () => {
    const onSave = vi.fn();
    const onDelete = vi.fn();
    const onClose = vi.fn();

    const initialPayload = createZoteroCitationPayload({
      citationID: "cit-existing-1",
      items: [
        {
          id: "item-101",
          itemData: MOCK_CSL_LIBBY,
          locator: "42",
          label: "page",
        },
      ],
      formattedCitation: "(Libby, 2021, p. 42)",
    });

    render(
      <CitationEditorModal
        isOpen={true}
        mode="edit"
        markName="ZOTERO_ITEM CSL_CITATION {...} RND12345"
        initialPayload={initialPayload}
        currentStyleId="apa"
        availableItems={[MOCK_CSL_LIBBY]}
        onSave={onSave}
        onDelete={onDelete}
        onClose={onClose}
      />,
    );

    expect(screen.getByText("Atfı Düzenle")).toBeDefined();
    const deleteBtn = screen.getByTestId("delete-citation-btn");
    expect(deleteBtn).toBeDefined();

    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledWith("ZOTERO_ITEM CSL_CITATION {...} RND12345");
    expect(onClose).toHaveBeenCalled();
  });

  it("supports multi-item cluster by adding another source", () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <CitationEditorModal
        isOpen={true}
        mode="insert"
        currentStyleId="apa"
        availableItems={[MOCK_CSL_LIBBY, MOCK_CSL_KAHNEMAN]}
        onSave={onSave}
        onClose={onClose}
      />,
    );

    // Initial cluster has Libby
    expect(screen.getByTestId("citation-cluster-item-0")).toBeDefined();

    // Open add source
    fireEvent.click(screen.getByTestId("add-source-to-citation-btn"));
    // Click on Kahneman in picker
    const kahnemanBtn = screen.getByText(/Kahneman/);
    fireEvent.click(kahnemanBtn);

    // Now 2 items in cluster
    expect(screen.getByTestId("citation-cluster-item-0")).toBeDefined();
    expect(screen.getByTestId("citation-cluster-item-1")).toBeDefined();

    const preview = screen.getByTestId("citation-live-preview");
    expect(preview.textContent).toContain("Kahneman");
    expect(preview.textContent).toContain("Libby");
  });
});

describe("DocumentCitationsDrawer Component", () => {
  const sampleCitations: DocumentCitationItem[] = [
    {
      markName: "ZOTERO_ITEM CSL_CITATION {...} RND001",
      payload: createZoteroCitationPayload({
        citationID: "cit-1",
        items: [{ id: "item-101", itemData: MOCK_CSL_LIBBY, locator: "525" }],
        formattedCitation: "(Libby, 2021, p. 525)",
      }),
      formattedText: "(Libby, 2021, p. 525)",
    },
  ];

  it("renders citations list, edit/delete triggers, and insert bibliography", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onInsertBib = vi.fn();
    const onRefreshAll = vi.fn();
    const onClose = vi.fn();

    render(
      <DocumentCitationsDrawer
        isOpen={true}
        onClose={onClose}
        citations={sampleCitations}
        activeStyleId="apa"
        hasBibliography={false}
        bibliographyEntries={["Libby, P. (2021). The changing landscape..."]}
        onEditCitation={onEdit}
        onDeleteCitation={onDelete}
        onInsertBibliography={onInsertBib}
        onRefreshAll={onRefreshAll}
      />,
    );

    expect(screen.getByTestId("document-citations-drawer")).toBeDefined();
    expect(screen.getByText("(Libby, 2021, p. 525)")).toBeDefined();

    // Edit citation
    fireEvent.click(screen.getByTestId("edit-citation-btn-0"));
    expect(onEdit).toHaveBeenCalledWith(sampleCitations[0]);

    // Delete citation
    fireEvent.click(screen.getByTestId("delete-citation-btn-0"));
    expect(onDelete).toHaveBeenCalledWith(sampleCitations[0].markName);

    // Insert bibliography
    fireEvent.click(screen.getByTestId("insert-bibliography-btn"));
    expect(onInsertBib).toHaveBeenCalledTimes(1);

    // Refresh all
    fireEvent.click(screen.getByTestId("refresh-citations-btn"));
    expect(onRefreshAll).toHaveBeenCalledTimes(1);
  });
});

describe("CollaboraEditorPage Full Citation Workflow", () => {
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

  it("renders CSL style selector, Insert Citation button, and Citations drawer", async () => {
    render(
      <CollaboraEditorPage
        documentId="doc-test-workflow"
        documentTitle="Quantum Gravity & Spacetime"
      />,
    );

    // Style selector is visible
    expect(screen.getByTestId("csl-style-selector")).toBeDefined();
    expect(screen.getByTestId("collabora-insert-citation-btn")).toBeDefined();
    expect(screen.getByTestId("collabora-citations-drawer-btn")).toBeDefined();

    // Open citations drawer
    fireEvent.click(screen.getByTestId("collabora-citations-drawer-btn"));
    expect(screen.getByTestId("document-citations-drawer")).toBeDefined();

    // Close citations drawer
    fireEvent.click(screen.getByTestId("close-citations-drawer-btn"));
    expect(screen.queryByTestId("document-citations-drawer")).toBeNull();

    // Open insert citation modal
    fireEvent.click(screen.getByTestId("collabora-insert-citation-btn"));
    expect(screen.getByTestId("citation-editor-modal")).toBeDefined();

    // Close insert citation modal
    fireEvent.click(screen.getByTestId("close-citation-modal-btn"));
    expect(screen.queryByTestId("citation-editor-modal")).toBeNull();
  });
});
