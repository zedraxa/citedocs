import { useState } from "react";
import {
  FileText,
  Share2,
  MessageSquare,
  Undo2,
  Redo2,
  Printer,
  Bold,
  Italic,
  Underline,
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
  Highlighter,
} from "lucide-react";

export function App() {
  const [docTitle, setDocTitle] = useState(
    "Scientific Writing Assignment: Quantum Gravity & Spacetime",
  );
  const [mode, setMode] = useState<"editing" | "suggesting" | "viewing">("editing");
  const [showOutline, setShowOutline] = useState(true);
  const [showPdfReader, setShowPdfReader] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [cslStyle, setCslStyle] = useState("apa");
  const [citationSearchOpen, setCitationSearchOpen] = useState(false);
  const [citationQuery, setCitationQuery] = useState("");

  const mockCitations = [
    {
      id: "einstein1935",
      title: "Can Quantum-Mechanical Description of Physical Reality be Considered Complete?",
      authors: "Einstein, Podolsky, Rosen",
      year: "1935",
    },
    { id: "hawking1974", title: "Black hole explosions?", authors: "Hawking, S. W.", year: "1974" },
    {
      id: "kavak2026",
      title: "Autonomous Scientific Writing Systems & Collaborative CRDTs",
      authors: "Kavak, Y.",
      year: "2026",
    },
  ];

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
                <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> Saved to Zotero & Cloud
              </span>
            </div>
            {/* Menu items */}
            <nav className="flex space-x-3 text-xs text-gray-700 mt-0.5">
              <button className="hover:bg-gray-100 px-1 py-0.5 rounded">File</button>
              <button className="hover:bg-gray-100 px-1 py-0.5 rounded">Edit</button>
              <button className="hover:bg-gray-100 px-1 py-0.5 rounded">View</button>
              <button className="hover:bg-gray-100 px-1 py-0.5 rounded">Insert</button>
              <button className="hover:bg-gray-100 px-1 py-0.5 rounded">Format</button>
              <button className="hover:bg-gray-100 px-1 py-0.5 rounded">Tools</button>
              <button className="hover:bg-gray-100 px-1 py-0.5 rounded text-blue-700 font-semibold flex items-center gap-1">
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

          <button className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-sm">
            <Share2 className="w-4 h-4" />
            <span>Share</span>
          </button>

          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 to-indigo-600 text-white flex items-center justify-center font-bold text-xs ring-2 ring-white">
            YK
          </div>
        </div>
      </header>

      {/* 2. GOOGLE DOCS STYLE ACTION TOOLBAR */}
      <div className="bg-[#edf2fa] border-b border-gray-300 px-4 py-1.5 flex items-center space-x-2 overflow-x-auto text-sm">
        <button className="p-1 rounded hover:bg-white text-gray-700" title="Undo (Ctrl+Z)">
          <Undo2 className="w-4 h-4" />
        </button>
        <button className="p-1 rounded hover:bg-white text-gray-700" title="Redo (Ctrl+Y)">
          <Redo2 className="w-4 h-4" />
        </button>
        <button className="p-1 rounded hover:bg-white text-gray-700" title="Print (Ctrl+P)">
          <Printer className="w-4 h-4" />
        </button>
        <div className="h-4 w-[1px] bg-gray-300 mx-1" />

        <select className="bg-transparent text-xs font-medium text-gray-800 px-2 py-1 rounded hover:bg-white focus:outline-none">
          <option>Normal text</option>
          <option>Title</option>
          <option>Heading 1</option>
          <option>Heading 2</option>
          <option>Heading 3</option>
        </select>
        <div className="h-4 w-[1px] bg-gray-300 mx-1" />

        <select className="bg-transparent text-xs font-medium text-gray-800 px-2 py-1 rounded hover:bg-white focus:outline-none">
          <option>Inter</option>
          <option>Times New Roman</option>
          <option>Georgia</option>
          <option>Arial</option>
        </select>
        <div className="h-4 w-[1px] bg-gray-300 mx-1" />

        <button
          className="p-1 rounded hover:bg-white text-gray-800 font-bold"
          title="Bold (Ctrl+B)"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button className="p-1 rounded hover:bg-white text-gray-800 italic" title="Italic (Ctrl+I)">
          <Italic className="w-4 h-4" />
        </button>
        <button
          className="p-1 rounded hover:bg-white text-gray-800 underline"
          title="Underline (Ctrl+U)"
        >
          <Underline className="w-4 h-4" />
        </button>
        <button className="p-1 rounded hover:bg-white text-yellow-600" title="Highlight">
          <Highlighter className="w-4 h-4" />
        </button>
        <div className="h-4 w-[1px] bg-gray-300 mx-1" />

        <button className="p-1 rounded hover:bg-white text-gray-700">
          <AlignLeft className="w-4 h-4" />
        </button>
        <button className="p-1 rounded hover:bg-white text-gray-700">
          <AlignCenter className="w-4 h-4" />
        </button>
        <button className="p-1 rounded hover:bg-white text-gray-700">
          <AlignRight className="w-4 h-4" />
        </button>
        <button className="p-1 rounded hover:bg-white text-gray-700">
          <AlignJustify className="w-4 h-4" />
        </button>
        <div className="h-4 w-[1px] bg-gray-300 mx-1" />

        <button className="p-1 rounded hover:bg-white text-gray-700">
          <List className="w-4 h-4" />
        </button>
        <button className="p-1 rounded hover:bg-white text-gray-700">
          <ListOrdered className="w-4 h-4" />
        </button>
        <div className="h-4 w-[1px] bg-gray-300 mx-1" />

        {/* ZOTERO CITATION QUICK BUTTON */}
        <button
          onClick={() => setCitationSearchOpen(true)}
          className="flex items-center space-x-1.5 bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 rounded text-xs font-semibold shadow-sm transition-colors"
          title="Add / Edit Citation (Ctrl+Shift+P)"
        >
          <BookMarked className="w-3.5 h-3.5" />
          <span>Add Citation</span>
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
        {showOutline && (
          <aside className="w-64 bg-white border-r border-gray-200 p-4 overflow-y-auto flex-shrink-0 hidden md:block">
            <div className="flex items-center justify-between mb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <span>Document Outline</span>
              <Bookmark className="w-3.5 h-3.5" />
            </div>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="font-semibold text-blue-600 cursor-pointer">1. Introduction</li>
              <li className="pl-3 hover:text-blue-600 cursor-pointer text-gray-600">
                1.1 Background & Motivation
              </li>
              <li className="pl-3 hover:text-blue-600 cursor-pointer text-gray-600">
                1.2 Statement of Problem
              </li>
              <li className="font-semibold hover:text-blue-600 cursor-pointer">2. Related Works</li>
              <li className="font-semibold hover:text-blue-600 cursor-pointer">
                3. Theoretical Model
              </li>
              <li className="font-semibold hover:text-blue-600 cursor-pointer">4. Discussion</li>
              <li className="font-semibold hover:text-blue-600 cursor-pointer">5. References</li>
            </ul>
          </aside>
        )}

        {/* Center: Google Docs Style Paged Editor Canvas */}
        <main className="flex-1 google-docs-canvas overflow-y-auto p-4 md:p-8 flex justify-center">
          <div className="paged-sheet">
            <h1 className="text-2xl font-bold mb-4 text-center">
              Scientific Writing Assignment: Quantum Gravity & Spacetime
            </h1>
            <p className="text-center text-sm text-gray-600 mb-8">
              Yusuf Kavak &bull; Scientific Writing Class &bull; October 2026
            </p>

            <h2 className="text-lg font-bold text-gray-800 mb-2">1. Introduction</h2>
            <p className="text-justify leading-relaxed mb-4 text-[15px]">
              The reconciliation of general relativity and quantum mechanics remains one of the
              preeminent foundational problems in modern theoretical physics. As articulated in
              early foundational paradoxes{" "}
              <span className="citedocs-citation inline-block cursor-pointer px-1 rounded bg-blue-50 text-blue-800 hover:bg-blue-100 font-medium select-none transition-colors border border-blue-200">
                (Einstein, Podolsky, &amp; Rosen, 1935, p. 777)
              </span>
              , local realism imposes severe constraints on wave function collapse dynamics.
              Furthermore, thermodynamic properties of gravitational horizons imply that quantum
              fluctuations lead directly to particle emission{" "}
              <span className="citedocs-citation inline-block cursor-pointer px-1 rounded bg-blue-50 text-blue-800 hover:bg-blue-100 font-medium select-none transition-colors border border-blue-200">
                (Hawking, 1974)
              </span>
              .
            </p>

            {/* Example Suggestion / Track Change */}
            <div className="mb-4 text-justify leading-relaxed text-[15px]">
              Recent breakthroughs in autonomous collaborative word processors{" "}
              <span className="citedocs-suggestion-delete line-through decoration-red-500 decoration-2 text-red-700 bg-red-50/70 px-0.5">
                have shown minor benefits
              </span>{" "}
              <span className="citedocs-suggestion-insert underline decoration-green-500 decoration-2 text-green-900 bg-green-50/70 px-0.5">
                have demonstrated decisive structural improvements in scientific manuscript
                workflows
              </span>{" "}
              <span className="citedocs-citation inline-block cursor-pointer px-1 rounded bg-blue-50 text-blue-800 hover:bg-blue-100 font-medium select-none transition-colors border border-blue-200">
                (Kavak, 2026)
              </span>
              .
            </div>

            <h2 className="text-lg font-bold text-gray-800 mt-8 mb-2">5. References</h2>
            <div className="csl-bib-body text-sm space-y-3 leading-relaxed border-t border-gray-200 pt-4">
              <div className="csl-entry pl-6 -indent-6">
                Einstein, A., Podolsky, B., &amp; Rosen, N. (1935). Can quantum-mechanical
                description of physical reality be considered complete? <i>Physical Review</i>,
                47(10), 777–780. https://doi.org/10.1103/PhysRev.47.777
              </div>
              <div className="csl-entry pl-6 -indent-6">
                Hawking, S. W. (1974). Black hole explosions? <i>Nature</i>, 248(5443), 30–31.
                https://doi.org/10.1038/248030a0
              </div>
              <div className="csl-entry pl-6 -indent-6">
                Kavak, Y. (2026). Autonomous scientific writing systems &amp; collaborative CRDTs.{" "}
                <i>Journal of Open Scientific Systems</i>, 12(3), 45–62.
              </div>
            </div>
          </div>
        </main>

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
                <button className="w-full bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-300 py-1 rounded text-[11px] font-semibold mt-2">
                  + Insert Quote into Document
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* QUICK CITATION MODAL (Zotero Red Bar) */}
      {citationSearchOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg border border-gray-300 overflow-hidden">
            <div className="bg-red-600 text-white px-4 py-2.5 flex items-center justify-between">
              <span className="font-semibold text-sm flex items-center gap-1.5">
                <BookMarked className="w-4 h-4" /> CiteDocs Quick Citation Picker
              </span>
              <button
                onClick={() => setCitationSearchOpen(false)}
                className="text-white/80 hover:text-white"
              >
                &times;
              </button>
            </div>
            <div className="p-3 border-b border-gray-200 flex items-center space-x-2">
              <Search className="w-4 h-4 text-gray-400" />
              <input
                type="text"
                autoFocus
                placeholder="Search by author, title, year, or enter DOI..."
                value={citationQuery}
                onChange={(e) => setCitationQuery(e.target.value)}
                className="w-full text-sm outline-none"
              />
            </div>
            <div className="max-h-60 overflow-y-auto divide-y divide-gray-100">
              {mockCitations
                .filter(
                  (c) =>
                    c.title.toLowerCase().includes(citationQuery.toLowerCase()) ||
                    c.authors.toLowerCase().includes(citationQuery.toLowerCase()),
                )
                .map((cite) => (
                  <div
                    key={cite.id}
                    onClick={() => setCitationSearchOpen(false)}
                    className="p-3 hover:bg-blue-50 cursor-pointer flex flex-col text-left transition-colors"
                  >
                    <span className="text-xs font-semibold text-gray-800">{cite.title}</span>
                    <span className="text-[11px] text-gray-500 mt-0.5">
                      {cite.authors} ({cite.year})
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* 4. FOOTER STATUS BAR */}
      <footer className="bg-white border-t border-gray-200 px-4 py-1.5 flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center space-x-4">
          <span>Words: 342</span>
          <span>Characters: 2,145</span>
          <span>Reading time: 2 min</span>
        </div>
        <div className="flex items-center space-x-3">
          <span className="flex items-center gap-1 text-green-700">
            <span className="w-2 h-2 rounded-full bg-green-500"></span> Online (PWA Ready)
          </span>
          <span>Style: {cslStyle.toUpperCase()}</span>
        </div>
      </footer>
    </div>
  );
}
