import { useState, useMemo, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { createEditorExtensions } from "@citedocs/editor";
import { useCollab } from "./hooks/useCollab.js";
import {
  FileText,
  Share2,
  MessageSquare,
  Undo2,
  Redo2,
  Printer,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  BookOpen,
  Bookmark,
  CheckCircle2,
  ChevronDown,
  Search,
  BookMarked,
  Quote,
  Code,
  Sparkles,
} from "lucide-react";
import { AddByIdentifier, type AddByIdentifierItem } from "./components/AddByIdentifier.js";

import { OutlineSidebar } from "./components/OutlineSidebar.js";
import { ZoteroSidebar } from "./zotero/index.js";
import {
  AuthProvider,
  UserMenu,
  AuthModal,
  LoginPage,
  SignupPage,
  ForgotPasswordPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from "./auth/index.js";

const INITIAL_CONTENT = `
<h1 style="text-align: center">Scientific Writing Assignment: Quantum Gravity &amp; Spacetime</h1>
<p style="text-align: center"><em>Yusuf Kavak &bull; Scientific Writing Class &bull; October 2026</em></p>
<h2>1. Introduction</h2>
<p>The reconciliation of general relativity and quantum mechanics remains one of the preeminent foundational problems in modern theoretical physics. As articulated in early foundational paradoxes <span data-citation-id="einstein1935" data-items='[{"id":"einstein1935","locator":"777"}]'>(Einstein, Podolsky, &amp; Rosen, 1935, p. 777)</span>, local realism imposes severe constraints on wave function collapse dynamics. Furthermore, thermodynamic properties of gravitational horizons imply that quantum fluctuations lead directly to particle emission <span data-citation-id="hawking1974" data-items='[{"id":"hawking1974"}]'>(Hawking, 1974)</span>.</p>
<h2>2. Autonomous Systems &amp; Collaborative CRDTs</h2>
<p>Recent breakthroughs in autonomous collaborative word processors have demonstrated decisive structural improvements in scientific manuscript workflows <span data-citation-id="kavak2026" data-items='[{"id":"kavak2026"}]'>(Kavak, 2026)</span>. The integration of citation clusters directly into the document AST guarantees citation integrity across collaborative editing sessions.</p>
<h2>5. References</h2>
<p>Einstein, A., Podolsky, B., &amp; Rosen, N. (1935). Can quantum-mechanical description of physical reality be considered complete? <em>Physical Review</em>, 47(10), 777–780. https://doi.org/10.1103/PhysRev.47.777</p>
<p>Hawking, S. W. (1974). Black hole explosions? <em>Nature</em>, 248(5443), 30–31. https://doi.org/10.1038/248030a0</p>
<p>Kavak, Y. (2026). Autonomous scientific writing systems &amp; collaborative CRDTs. <em>Journal of Open Scientific Systems</em>, 12(3), 45–62.</p>
`;

function AppEditor() {

  const [docTitle, setDocTitle] = useState(
    "Scientific Writing Assignment: Quantum Gravity & Spacetime",
  );
  const [mode, setMode] = useState<"editing" | "suggesting" | "viewing">("editing");
  const [showOutline, setShowOutline] = useState(true);
  const [showPdfReader, setShowPdfReader] = useState(false);
  const [showZoteroSidebar, setShowZoteroSidebar] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [cslStyle, setCslStyle] = useState("apa");
  const [citationSearchOpen, setCitationSearchOpen] = useState(false);
  const [citationQuery, setCitationQuery] = useState("");
  const [citationModalTab, setCitationModalTab] = useState<"search" | "identifier">("search");

  // Real-time Hocuspocus CRDT Collaboration provider
  const {
    provider,
    ydoc,
    documentId,
    currentUser,
    collaborators,
    status: collabStatus,
    isReadOnly,
  } = useCollab();

  const INITIAL_CITATIONS: AddByIdentifierItem[] = [
    {
      id: "einstein1935",
      title: "Can Quantum-Mechanical Description of Physical Reality be Considered Complete?",
      authors: "Einstein, Podolsky, Rosen",
      year: "1935",
      doi: "10.1103/PhysRev.47.777",
    },
    {
      id: "hawking1974",
      title: "Black hole explosions?",
      authors: "Hawking, S. W.",
      year: "1974",
      doi: "10.1038/248030a0",
    },
    {
      id: "kavak2026",
      title: "Autonomous Scientific Writing Systems & Collaborative CRDTs",
      authors: "Kavak, Y.",
      year: "2026",
    },
  ];

  const [libraryItems, setLibraryItems] = useState<AddByIdentifierItem[]>(INITIAL_CITATIONS);

  const handleItemAdded = (item: AddByIdentifierItem) => {
    setLibraryItems((prev) => {
      if (
        prev.some(
          (p) =>
            p.id === item.id ||
            (item.doi && p.doi && p.doi.toLowerCase() === item.doi.toLowerCase()),
        )
      ) {
        return prev;
      }
      return [item, ...prev];
    });
  };

  // TipTap Editor instance with Yjs CRDT Collaboration and Carets
  const editor = useEditor({
    extensions: createEditorExtensions({
      placeholder: "Start typing your academic paper, or click 'Add Citation' to cite...",
      provider,
      document: ydoc,
      user: currentUser,
    }),
    editable: mode !== "viewing" && !isReadOnly,
    onCreate({ editor: instance }) {
      if (instance.isEmpty) {
        instance.commands.setContent(INITIAL_CONTENT);
      }
    },
  });

  // Ensure content is seeded if the collaborative document is newly created/empty
  useEffect(() => {
    if (editor && editor.isEmpty) {
      editor.commands.setContent(INITIAL_CONTENT);
    }
  }, [editor]);

  // Calculate live statistics
  const docText = editor?.getText() || "";
  const wordCount = useMemo(() => {
    const trimmed = docText.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [docText]);
  const charCount = docText.length;
  const readTime = Math.max(1, Math.ceil(wordCount / 200));

  // Handle citation insert from Quick Citation Picker
  const handleInsertCitation = (cite: {
    id: string;
    title: string;
    authors: string;
    year: string;
  }) => {
    if (!editor) return;
    const authorShort = cite.authors.split(",")[0]?.trim() || cite.authors;
    const formattedText = `(${authorShort}, ${cite.year})`;

    editor
      .chain()
      .focus()
      .insertContent({
        type: "citation",
        attrs: {
          citationId: `cit-${cite.id}-${Date.now()}`,
          items: [{ id: cite.id }],
          formattedText,
          noteIndex: 0,
        },
      })
      .run();

    setCitationSearchOpen(false);
  };

  // Insert quote from PDF reader
  const handleInsertQuote = () => {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .insertContent([
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "“In this letter I describe a mechanism by which a black hole can emit radiation with a thermal spectrum...” ",
                },
                {
                  type: "citation",
                  attrs: {
                    citationId: "hawking1974",
                    items: [{ id: "hawking1974" }],
                    formattedText: "(Hawking, 1974)",
                    noteIndex: 0,
                  },
                },
              ],
            },
          ],
        },
      ])
      .run();
  };

  // Current heading selector value
  const currentHeadingValue = editor?.isActive("heading", { level: 1 })
    ? "h1"
    : editor?.isActive("heading", { level: 2 })
      ? "h2"
      : editor?.isActive("heading", { level: 3 })
        ? "h3"
        : editor?.isActive("heading", { level: 4 })
          ? "h4"
          : "p";

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#f8f9fa] text-[#202124]">
      {/* 1. TOP HEADER & MENUBAR */}
      <header className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-600 text-white p-2 rounded-lg flex items-center justify-center shadow-sm">
            <BookMarked className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                className="text-base font-medium px-1.5 py-0.5 rounded border border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none max-w-md truncate"
              />
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> Saved to Zotero &amp; Cloud
              </span>
              {/* Connection Status Indicator */}
              <div className="flex items-center ml-2" data-testid="collab-status">
                {collabStatus === "connected" && (
                  <span
                    className="flex items-center gap-1 text-[11px] text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full font-medium"
                    title={`Connected to document: ${documentId}`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    <span>Live Collab</span>
                  </span>
                )}
                {collabStatus === "read-only" && (
                  <span
                    className="flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium"
                    title="Read-only viewer access"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <span>Read-Only</span>
                  </span>
                )}
                {collabStatus === "connecting" && (
                  <span
                    className="flex items-center gap-1 text-[11px] text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full font-medium"
                    title="Connecting to collaboration server..."
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
                    <span>Connecting</span>
                  </span>
                )}
                {collabStatus === "disconnected" && (
                  <span
                    className="flex items-center gap-1 text-[11px] text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full font-medium"
                    title="Working offline"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                    <span>Offline</span>
                  </span>
                )}
              </div>
            </div>
            {/* Menu items */}
            <nav className="flex space-x-3 text-xs text-gray-700 mt-0.5">
              <button className="hover:bg-gray-100 px-1 py-0.5 rounded">File</button>
              <button className="hover:bg-gray-100 px-1 py-0.5 rounded">Edit</button>
              <button className="hover:bg-gray-100 px-1 py-0.5 rounded">View</button>
              <button className="hover:bg-gray-100 px-1 py-0.5 rounded">Insert</button>
              <button className="hover:bg-gray-100 px-1 py-0.5 rounded">Format</button>
              <button className="hover:bg-gray-100 px-1 py-0.5 rounded">Tools</button>
              <button
                onClick={() => {
                  setCitationModalTab("search");
                  setCitationSearchOpen(true);
                }}
                className="hover:bg-gray-100 px-1 py-0.5 rounded text-blue-700 font-semibold flex items-center gap-1 cursor-pointer"
                data-testid="menu-zotero-btn"
              >
                <BookOpen className="w-3 h-3 text-red-600" /> Zotero
              </button>
              <button className="hover:bg-gray-100 px-1 py-0.5 rounded">Help</button>
            </nav>
          </div>
        </div>

        {/* Right side controls */}
        <div className="flex items-center space-x-3">
          {/* Mode Switcher */}
          <div className="relative">
            <button
              onClick={() =>
                setMode(
                  mode === "editing" ? "suggesting" : mode === "suggesting" ? "viewing" : "editing",
                )
              }
              className="flex items-center space-x-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full border border-gray-300 hover:bg-gray-50"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  mode === "editing"
                    ? "bg-blue-600"
                    : mode === "suggesting"
                      ? "bg-green-600"
                      : "bg-purple-600"
                }`}
              />
              <span className="capitalize">{mode}</span>
              <ChevronDown className="w-3 h-3 text-gray-500" />
            </button>
          </div>

          <button
            onClick={() => setShowOutline(!showOutline)}
            className={`p-1.5 rounded-full hover:bg-gray-100 text-gray-600 ${showOutline ? "bg-gray-100" : ""}`}
            title="Toggle Document Outline"
            aria-expanded={showOutline}
            aria-controls="document-outline"
          >
            <Bookmark className="w-5 h-5" />
          </button>

          <button
            onClick={() => setShowComments(!showComments)}
            className={`p-1.5 rounded-full hover:bg-gray-100 text-gray-600 ${showComments ? "bg-gray-200" : ""}`}
            title="Comments history"
          >
            <MessageSquare className="w-5 h-5" />
          </button>

          <button
            onClick={() => setShowPdfReader(!showPdfReader)}
            className={`flex items-center space-x-1.5 text-xs font-medium px-3 py-1.5 rounded-full border ${
              showPdfReader
                ? "bg-blue-50 border-blue-400 text-blue-700"
                : "border-gray-300 hover:bg-gray-50"
            }`}
          >
            <FileText className="w-4 h-4 text-red-600" />
            <span>PDF Split Reader</span>
          </button>

          <button
            onClick={() => setShowZoteroSidebar(!showZoteroSidebar)}
            className={`flex items-center space-x-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
              showZoteroSidebar
                ? "bg-red-50 border-red-400 text-red-700 font-semibold"
                : "border-gray-300 hover:bg-gray-50 text-gray-700"
            }`}
            data-testid="toggle-zotero-sidebar-btn"
            title="Toggle Zotero Web Library Sidebar"
          >
            <span className="w-4 h-4 bg-[#c92c2c] text-white rounded flex items-center justify-center font-black text-[10px] leading-none">
              Z
            </span>
            <span>Zotero Library</span>
          </button>

          {/* Presence Avatar List */}
          <div
            className="flex items-center -space-x-1.5 overflow-hidden px-1"
            data-testid="collab-presence"
            title={`${collaborators.length} collaborator${collaborators.length !== 1 ? "s" : ""} online`}
          >
            {collaborators.map((c) => {
              const initials =
                c.name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase() || "U";
              return (
                <div
                  key={c.clientId}
                  style={{ backgroundColor: c.color }}
                  className="relative inline-flex items-center justify-center w-7 h-7 rounded-full text-white text-[11px] font-bold ring-2 ring-white shadow-sm select-none transition-transform hover:scale-110 hover:z-20 cursor-default"
                  title={`${c.name}${c.isSelf ? " (You)" : ""}`}
                >
                  {initials}
                </div>
              );
            })}
          </div>

          <button className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-sm">
            <Share2 className="w-4 h-4" />
            <span>Share</span>
          </button>

          <UserMenu currentUser={currentUser} />
        </div>
      </header>

      {/* 2. GOOGLE DOCS STYLE ACTION TOOLBAR */}
      <div className="bg-[#edf2fa] border-b border-gray-300 px-4 py-1.5 flex items-center space-x-2 overflow-x-auto text-sm">
        {/* Undo */}
        <button
          onClick={() => editor?.chain().focus().undo().run()}
          disabled={!editor?.can().undo()}
          className="p-1 rounded hover:bg-white text-gray-700 disabled:opacity-40 disabled:hover:bg-transparent"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </button>

        {/* Redo */}
        <button
          onClick={() => editor?.chain().focus().redo().run()}
          disabled={!editor?.can().redo()}
          className="p-1 rounded hover:bg-white text-gray-700 disabled:opacity-40 disabled:hover:bg-transparent"
          title="Redo (Ctrl+Y)"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        {/* Print */}
        <button
          onClick={() => window.print()}
          className="p-1 rounded hover:bg-white text-gray-700"
          title="Print (Ctrl+P)"
        >
          <Printer className="w-4 h-4" />
        </button>

        <div className="h-4 w-[1px] bg-gray-300 mx-1" />

        {/* Headings Dropdown */}
        <select
          value={currentHeadingValue}
          onChange={(e) => {
            const val = e.target.value;
            if (val === "p") {
              editor?.chain().focus().setParagraph().run();
            } else if (val === "h1") {
              editor?.chain().focus().setHeading({ level: 1 }).run();
            } else if (val === "h2") {
              editor?.chain().focus().setHeading({ level: 2 }).run();
            } else if (val === "h3") {
              editor?.chain().focus().setHeading({ level: 3 }).run();
            } else if (val === "h4") {
              editor?.chain().focus().setHeading({ level: 4 }).run();
            }
          }}
          className="bg-transparent text-xs font-medium text-gray-800 px-2 py-1 rounded hover:bg-white focus:outline-none"
        >
          <option value="p">Normal text</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="h4">Heading 4</option>
        </select>

        <div className="h-4 w-[1px] bg-gray-300 mx-1" />

        {/* Bold */}
        <button
          onClick={() => editor?.chain().focus().toggleBold().run()}
          className={`p-1 rounded transition-colors ${
            editor?.isActive("bold")
              ? "bg-blue-100 text-blue-700 font-bold"
              : "hover:bg-white text-gray-800"
          }`}
          title="Bold (Ctrl+B)"
        >
          <Bold className="w-4 h-4" />
        </button>

        {/* Italic */}
        <button
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          className={`p-1 rounded transition-colors ${
            editor?.isActive("italic")
              ? "bg-blue-100 text-blue-700 font-bold"
              : "hover:bg-white text-gray-800 italic"
          }`}
          title="Italic (Ctrl+I)"
        >
          <Italic className="w-4 h-4" />
        </button>

        {/* Underline */}
        <button
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          className={`p-1 rounded transition-colors ${
            editor?.isActive("underline")
              ? "bg-blue-100 text-blue-700 font-bold"
              : "hover:bg-white text-gray-800 underline"
          }`}
          title="Underline (Ctrl+U)"
        >
          <UnderlineIcon className="w-4 h-4" />
        </button>

        {/* Strikethrough */}
        <button
          onClick={() => editor?.chain().focus().toggleStrike().run()}
          className={`p-1 rounded transition-colors ${
            editor?.isActive("strike")
              ? "bg-blue-100 text-blue-700 font-bold"
              : "hover:bg-white text-gray-800"
          }`}
          title="Strikethrough"
        >
          <Strikethrough className="w-4 h-4" />
        </button>

        {/* Blockquote */}
        <button
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          className={`p-1 rounded transition-colors ${
            editor?.isActive("blockquote")
              ? "bg-blue-100 text-blue-700 font-bold"
              : "hover:bg-white text-gray-700"
          }`}
          title="Blockquote"
        >
          <Quote className="w-4 h-4" />
        </button>

        {/* Code Block */}
        <button
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
          className={`p-1 rounded transition-colors ${
            editor?.isActive("codeBlock")
              ? "bg-blue-100 text-blue-700 font-bold"
              : "hover:bg-white text-gray-700"
          }`}
          title="Code Block"
        >
          <Code className="w-4 h-4" />
        </button>

        <div className="h-4 w-[1px] bg-gray-300 mx-1" />

        {/* Text Alignments */}
        <button
          onClick={() => editor?.chain().focus().setTextAlign("left").run()}
          className={`p-1 rounded transition-colors ${
            editor?.isActive({ textAlign: "left" })
              ? "bg-blue-100 text-blue-700 font-bold"
              : "hover:bg-white text-gray-700"
          }`}
          title="Align Left"
        >
          <AlignLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor?.chain().focus().setTextAlign("center").run()}
          className={`p-1 rounded transition-colors ${
            editor?.isActive({ textAlign: "center" })
              ? "bg-blue-100 text-blue-700 font-bold"
              : "hover:bg-white text-gray-700"
          }`}
          title="Align Center"
        >
          <AlignCenter className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor?.chain().focus().setTextAlign("right").run()}
          className={`p-1 rounded transition-colors ${
            editor?.isActive({ textAlign: "right" })
              ? "bg-blue-100 text-blue-700 font-bold"
              : "hover:bg-white text-gray-700"
          }`}
          title="Align Right"
        >
          <AlignRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor?.chain().focus().setTextAlign("justify").run()}
          className={`p-1 rounded transition-colors ${
            editor?.isActive({ textAlign: "justify" })
              ? "bg-blue-100 text-blue-700 font-bold"
              : "hover:bg-white text-gray-700"
          }`}
          title="Align Justify"
        >
          <AlignJustify className="w-4 h-4" />
        </button>

        <div className="h-4 w-[1px] bg-gray-300 mx-1" />

        {/* Bullet and Ordered Lists */}
        <button
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          className={`p-1 rounded transition-colors ${
            editor?.isActive("bulletList")
              ? "bg-blue-100 text-blue-700 font-bold"
              : "hover:bg-white text-gray-700"
          }`}
          title="Bulleted List"
        >
          <List className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          className={`p-1 rounded transition-colors ${
            editor?.isActive("orderedList")
              ? "bg-blue-100 text-blue-700 font-bold"
              : "hover:bg-white text-gray-700"
          }`}
          title="Numbered List"
        >
          <ListOrdered className="w-4 h-4" />
        </button>

        <div className="h-4 w-[1px] bg-gray-300 mx-1" />

        {/* ZOTERO CITATION QUICK BUTTON */}
        <button
          onClick={() => {
            setCitationModalTab("search");
            setCitationSearchOpen(true);
          }}
          className="flex items-center space-x-1.5 bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 rounded text-xs font-semibold shadow-sm transition-colors cursor-pointer"
          title="Add Citation (Ctrl+Shift+P)"
          data-testid="add-citation-btn"
        >
          <BookMarked className="w-3.5 h-3.5" />
          <span>Add Citation</span>
        </button>

        {/* ADD BY IDENTIFIER TOOLBAR BUTTON */}
        <button
          onClick={() => {
            setCitationModalTab("identifier");
            setCitationSearchOpen(true);
          }}
          className="flex items-center space-x-1.5 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 px-2.5 py-1 rounded text-xs font-semibold shadow-sm transition-colors cursor-pointer"
          title="Add Item by Identifier (DOI, ISBN, PMID, arXiv)"
          data-testid="add-by-identifier-btn"
        >
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          <span>Add by Identifier</span>
        </button>

        {/* CSL STYLE SELECTOR */}
        <select
          value={cslStyle}
          onChange={(e) => setCslStyle(e.target.value)}
          className="bg-white border border-gray-300 text-xs text-gray-700 rounded px-2 py-1 focus:outline-none"
        >
          <option value="apa">APA 7th edition</option>
          <option value="ieee">IEEE</option>
          <option value="chicago-author-date">Chicago (Author-Date)</option>
          <option value="nature">Nature</option>
          <option value="vancouver">Vancouver</option>
        </select>
      </div>

      {/* 3. WORKSPACE BODY: OUTLINE + CANVAS + DRAWER */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Document Outline Sidebar */}
        {showOutline && <OutlineSidebar editor={editor} />}

        {/* Center: Real Google Docs Style TipTap Editor Canvas */}
        <main className="flex-1 google-docs-canvas overflow-y-auto p-4 md:p-8 flex justify-center">
          <div
            className="paged-sheet"
            onClick={() => {
              if (editor && !editor.isFocused) {
                editor.commands.focus();
              }
            }}
          >
            <EditorContent editor={editor} />
          </div>
        </main>

        {/* Zotero Web-Library Embedded Sidebar */}
        {showZoteroSidebar && (
          <ZoteroSidebar
            userId={currentUser.id}
            isOpen={showZoteroSidebar}
            onClose={() => setShowZoteroSidebar(false)}
            onCiteItem={(item) => handleInsertCitation(item)}
            onItemAdded={handleItemAdded}
          />
        )}

        {/* Right Sidebar: PDF Viewer or Comments Drawer */}
        {showPdfReader && (
          <aside className="w-96 bg-white border-l border-gray-300 flex flex-col h-full shadow-lg">
            <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-red-600" />
                <span className="text-xs font-semibold truncate max-w-[200px]">
                  hawking1974.pdf
                </span>
              </div>
              <button
                onClick={() => setShowPdfReader(false)}
                className="text-gray-400 hover:text-gray-600 text-xs"
              >
                Close &times;
              </button>
            </div>
            <div className="flex-1 p-4 bg-gray-100 flex flex-col items-center justify-center text-center">
              <div className="w-full bg-white p-6 shadow rounded border border-gray-300 text-left text-xs leading-5">
                <p className="font-bold mb-2">NATURE VOL. 248 MARCH 1 1974</p>
                <p className="bg-yellow-100 p-1 rounded mb-2">
                  &ldquo;In this letter I describe a mechanism by which a black hole can emit
                  radiation with a thermal spectrum...&rdquo;
                </p>
                <button
                  onClick={handleInsertQuote}
                  className="w-full bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-300 py-1 rounded text-[11px] font-semibold mt-2 transition-colors"
                >
                  + Insert Quote into Document
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* ZOTERO MODAL: QUICK CITATION & ADD BY IDENTIFIER */}
      {citationSearchOpen && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 backdrop-blur-xs"
          data-testid="zotero-modal-backdrop"
        >
          <div
            className="bg-white rounded-lg shadow-2xl w-full max-w-lg border border-gray-300 overflow-hidden flex flex-col"
            data-testid="zotero-modal"
          >
            {/* Modal Red Header */}
            <div className="bg-red-600 text-white px-4 py-2.5 flex items-center justify-between">
              <span className="font-semibold text-sm flex items-center gap-1.5">
                <BookMarked className="w-4 h-4" /> CiteDocs Reference Library &amp; Citation Picker
              </span>
              <button
                onClick={() => setCitationSearchOpen(false)}
                className="text-white/80 hover:text-white cursor-pointer text-lg leading-none p-1"
                title="Close dialog"
                data-testid="close-zotero-modal"
              >
                &times;
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-gray-200 bg-gray-50 text-xs">
              <button
                type="button"
                data-testid="tab-search"
                onClick={() => setCitationModalTab("search")}
                className={`flex-1 py-2 font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                  citationModalTab === "search"
                    ? "border-red-600 text-red-600 bg-white"
                    : "border-transparent text-gray-600 hover:text-gray-900"
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                <span>Search Library ({libraryItems.length})</span>
              </button>
              <button
                type="button"
                data-testid="tab-identifier"
                onClick={() => setCitationModalTab("identifier")}
                className={`flex-1 py-2 font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                  citationModalTab === "identifier"
                    ? "border-red-600 text-red-600 bg-white"
                    : "border-transparent text-gray-600 hover:text-gray-900"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Add by Identifier</span>
              </button>
            </div>

            {/* Tab 1: Search & Cite */}
            {citationModalTab === "search" && (
              <>
                <div className="p-3 border-b border-gray-200 flex items-center space-x-2">
                  <Search className="w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    autoFocus
                    placeholder="Search by author, title, year, or DOI..."
                    value={citationQuery}
                    onChange={(e) => setCitationQuery(e.target.value)}
                    className="w-full text-sm outline-none"
                    data-testid="quick-citation-search-input"
                  />
                </div>
                <div
                  className="max-h-60 overflow-y-auto divide-y divide-gray-100"
                  data-testid="library-items-list"
                >
                  {libraryItems
                    .filter(
                      (c) =>
                        c.title.toLowerCase().includes(citationQuery.toLowerCase()) ||
                        c.authors.toLowerCase().includes(citationQuery.toLowerCase()) ||
                        (c.doi && c.doi.toLowerCase().includes(citationQuery.toLowerCase())),
                    )
                    .map((cite) => (
                      <div
                        key={cite.id}
                        onClick={() => handleInsertCitation(cite)}
                        className="p-3 hover:bg-blue-50 cursor-pointer flex flex-col text-left transition-colors"
                        data-testid={`citation-item-${cite.id}`}
                      >
                        <span className="text-xs font-semibold text-gray-800">{cite.title}</span>
                        <div className="flex items-center gap-2 text-[11px] text-gray-500 mt-0.5">
                          <span>
                            {cite.authors} ({cite.year})
                          </span>
                          {cite.doi && (
                            <span className="text-blue-600 font-mono">DOI: {cite.doi}</span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
                <div className="p-2.5 bg-gray-50 border-t border-gray-200 text-center">
                  <button
                    type="button"
                    onClick={() => setCitationModalTab("identifier")}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center justify-center gap-1 mx-auto cursor-pointer"
                    data-testid="btn-switch-to-identifier"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Have a DOI, ISBN, PMID or arXiv? Add by Identifier</span>
                  </button>
                </div>
              </>
            )}

            {/* Tab 2: Add by Identifier */}
            {citationModalTab === "identifier" && (
              <AddByIdentifier
                userId={currentUser.id}
                onItemAdded={handleItemAdded}
                onCiteItem={handleInsertCitation}
                onClose={() => setCitationSearchOpen(false)}
              />
            )}
          </div>
        </div>
      )}

      {/* 4. FOOTER STATUS BAR */}
      <footer className="bg-white border-t border-gray-200 px-4 py-1.5 flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center space-x-4">
          <span>Words: {wordCount}</span>
          <span>Characters: {charCount}</span>
          <span>Reading time: {readTime} min</span>
        </div>
        <div className="flex items-center space-x-3">
          <span className="flex items-center gap-1.5 text-gray-600">
            <span
              className={`w-2 h-2 rounded-full ${
                collabStatus === "connected"
                  ? "bg-green-500 animate-pulse"
                  : collabStatus === "read-only"
                    ? "bg-amber-500"
                    : collabStatus === "connecting"
                      ? "bg-blue-500 animate-pulse"
                      : "bg-gray-400"
              }`}
            />
            {collabStatus === "connected"
              ? `Collab Active (${collaborators.length} online)`
              : collabStatus === "read-only"
                ? "Read-Only Mode"
                : collabStatus === "connecting"
                  ? "Connecting..."
                  : "Offline (Local)"}
          </span>
          <span className="text-gray-400">|</span>
          <span className="font-mono text-[11px] text-gray-600 truncate max-w-[150px]">
            doc: {documentId}
          </span>
          <span className="text-gray-400">|</span>
          <span>Style: {cslStyle.toUpperCase()}</span>
        </div>
      </footer>
      <AuthModal />
    </div>
  );
}

export function App() {
  const path = typeof window !== "undefined" ? window.location.pathname : "/";
  return (
    <AuthProvider>
      {path === "/login" ? (
        <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center p-4">
          <LoginPage standalone />
        </div>
      ) : path === "/signup" ? (
        <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center p-4">
          <SignupPage standalone />
        </div>
      ) : path === "/forgot-password" ? (
        <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center p-4">
          <ForgotPasswordPage standalone />
        </div>
      ) : path === "/reset-password" ? (
        <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center p-4">
          <ResetPasswordPage standalone />
        </div>
      ) : path === "/verify-email" ? (
        <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center p-4">
          <VerifyEmailPage standalone />
        </div>
      ) : (
        <AppEditor />
      )}
    </AuthProvider>
  );
}

