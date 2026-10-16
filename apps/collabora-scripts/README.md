# Collabora Online UNO Scripts (`apps/collabora-scripts`)

This directory contains the server-side Python macro scripts executed inside Collabora Online (LibreOffice Writer) via the `CallPythonScript` PostMessage protocol.

## Architecture

In LibreOffice Writer, Zotero tracks citations and bibliographies using hidden document structures:
- **Citation ReferenceMarks:** `ZOTERO_ITEM CSL_CITATION {json} RND<suffix>`
- **Bibliography Bookmarks / Marks:** `ZOTERO_BIBL {"uncited":[],"omitted":[],"custom":[]} CSL_BIBLIOGRAPHY RND<suffix>`
- **Document Preferences:** `ZOTERO_PREF {json} RND<suffix>`

The `zotero_collabora.py` script manipulates these structures via the LibreOffice UNO API (`com.sun.star.text.ReferenceMark`, `com.sun.star.text.Bookmark`, `XText`, `XTextViewCursor`).

## Available Functions

1. **`insert_citation(citationJson, formattedText, markName=None, rndSuffix=None)`**
   - Inserts visible formatted citation text (e.g., `(Libby, 2021)`) at the view cursor.
   - Creates a ReferenceMark with the full CSL_CITATION JSON payload and absorbs the formatted text range.
2. **`update_citation(markName, newMarkName, citationJson, formattedText)`**
   - Finds an existing ReferenceMark by name.
   - Updates the visible anchor string to the new formatted text.
   - Updates the ReferenceMark name if the payload or style changed.
3. **`insert_bibliography(formattedText, markName=None, biblJson=None, rndSuffix=None)`**
   - Inserts formatted bibliography text at the view cursor inside a Bookmark.
4. **`update_bibliography(markName, newMarkName=None, formattedText=None)`**
   - Updates the bibliography text in place.
5. **`get_document_fields()`**
   - Enumerates all ReferenceMarks and Bookmarks starting with `ZOTERO_ITEM`, `ZOTERO_BIBL`, or `ZOTERO_PREF`.
   - Returns a structured JSON list with each field's name and anchor text.
6. **`set_document_prefs(prefJson, markName=None)`**
   - Stores active CSL style and locale preferences in a `ZOTERO_PREF` ReferenceMark at the document start.

## Testing

Run offline unit tests with mock UNO document objects:
```bash
python3 -m unittest apps/collabora-scripts/test_zotero_collabora.py
```
