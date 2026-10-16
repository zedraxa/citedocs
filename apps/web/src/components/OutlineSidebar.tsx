import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";

interface Heading {
  pos: number;
  level: number;
  text: string;
}

export function OutlineSidebar({ editor }: { editor: Editor | null }) {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activePos, setActivePos] = useState<number | null>(null);

  useEffect(() => {
    if (!editor) {
      setHeadings([]);
      setActivePos(null);
      return;
    }

    const update = () => {
      const next: Heading[] = [];
      let active: number | null = null;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name !== "heading") return;
        const level = Number(node.attrs.level);
        if (level < 1 || level > 6) return;
        next.push({ pos, level, text: node.textContent });
        // The current section continues through its following body paragraphs.
        if (pos < editor.state.selection.from) active = pos;
      });
      setHeadings(next);
      setActivePos(active);
    };

    update();
    // Includes selection-only, formatting, and remote collaboration transactions.
    editor.on("transaction", update);
    return () => {
      editor.off("transaction", update);
    };
  }, [editor]);

  return (
    <aside
      aria-label="Document Outline"
      id="document-outline"
      className="w-64 bg-white border-r border-gray-200 p-4 overflow-y-auto flex-shrink-0"
    >
      <h2 className="mb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Document Outline
      </h2>
      {headings.length ? (
        <ul className="space-y-1 text-sm">
          {headings.map((heading) => (
            <li key={heading.pos}>
              <button
                type="button"
                aria-current={activePos === heading.pos ? "location" : undefined}
                title={heading.text || "Untitled heading"}
                style={{ paddingLeft: `${(heading.level - 1) * 12 + 8}px` }}
                className={`w-full rounded py-1 pr-2 text-left truncate hover:bg-blue-50 focus-visible:outline-blue-600 ${activePos === heading.pos ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-700"}`}
                onClick={() =>
                  editor
                    ?.chain()
                    .focus()
                    .setTextSelection(heading.pos + 1)
                    .scrollIntoView()
                    .run()
                }
              >
                {heading.text || "Untitled heading"}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-400 italic">No headings yet. Add headings to outline.</p>
      )}
    </aside>
  );
}
