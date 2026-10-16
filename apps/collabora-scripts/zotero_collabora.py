"""
Zotero - Collabora Online / LibreOffice Integration Macro
===========================================================

This Python script is invoked by Collabora Online via the CallPythonScript
PostMessage API from the CiteDocs web frontend.

It manages native LibreOffice ReferenceMarks and Bookmarks matching Zotero's
official LibreOffice Writer integration:
- Citation ReferenceMarks: ZOTERO_ITEM CSL_CITATION {json} RND...
- Bibliography Bookmarks / Marks: ZOTERO_BIBL {"uncited":[],"omitted":[],"custom":[]} CSL_BIBLIOGRAPHY RND...
- Document Preferences: ZOTERO_PREF {json} RND...
"""

import json
import random
import string
import sys

# Try importing uno (present in LibreOffice / Collabora runtime)
try:
    import uno
except ImportError:
    uno = None


def generate_rnd(length=10):
    chars = string.ascii_letters + string.digits
    return "".join(random.choice(chars) for _ in range(length))


def get_current_doc(doc=None):
    if doc is not None:
        return doc
    if "XSCRIPTCONTEXT" in globals():
        return globals()["XSCRIPTCONTEXT"].getDocument()
    raise RuntimeError("No LibreOffice document context available")


def insert_citation(citationJson, formattedText, markName=None, rndSuffix=None, doc=None):
    """
    Inserts a new in-text citation ReferenceMark at the current cursor position.
    """
    document = get_current_doc(doc)
    controller = document.getCurrentController()
    view_cursor = controller.getViewCursor()
    text = view_cursor.getText() if hasattr(view_cursor, "getText") else document.getText()

    suffix = rndSuffix or generate_rnd()
    name = markName or f"ZOTERO_ITEM CSL_CITATION {citationJson} RND{suffix}"

    ref_mark = document.createInstance("com.sun.star.text.ReferenceMark")
    ref_mark.setName(name)

    # Insert formatted citation text and absorb inside ReferenceMark
    text.insertString(view_cursor, formattedText, False)
    view_cursor.goLeft(len(formattedText), True)
    text.insertTextContent(view_cursor, ref_mark, True)
    view_cursor.collapseToEnd()

    return json.dumps({
        "status": "ok",
        "action": "insert_citation",
        "markName": name,
        "formattedText": formattedText,
    })


def update_citation(markName, newMarkName, citationJson, formattedText, doc=None):
    """
    Updates the text and metadata of an existing citation ReferenceMark.
    """
    document = get_current_doc(doc)
    ref_marks = document.getReferenceMarks()

    if not ref_marks.hasByName(markName):
        return json.dumps({
            "status": "error",
            "action": "update_citation",
            "message": f"ReferenceMark '{markName}' not found",
        })

    old_mark = ref_marks.getByName(markName)
    anchor = old_mark.getAnchor()
    text = document.getText()

    # Update visible text inside anchor
    anchor.setString(formattedText)

    # If mark name changed (e.g. updated payload)
    target_name = newMarkName or markName
    if target_name != markName:
        new_mark = document.createInstance("com.sun.star.text.ReferenceMark")
        new_mark.setName(target_name)
        text.removeTextContent(old_mark)
        text.insertTextContent(anchor, new_mark, True)

    return json.dumps({
        "status": "ok",
        "action": "update_citation",
        "markName": target_name,
        "formattedText": formattedText,
    })


def insert_bibliography(formattedText, markName=None, biblJson=None, rndSuffix=None, doc=None):
    """
    Inserts the bibliography as a Bookmark or ReferenceMark at the current cursor position.
    """
    document = get_current_doc(doc)
    controller = document.getCurrentController()
    view_cursor = controller.getViewCursor()
    text = view_cursor.getText() if hasattr(view_cursor, "getText") else document.getText()

    suffix = rndSuffix or generate_rnd()
    payload = biblJson or '{"uncited":[],"omitted":[],"custom":[]}'
    name = markName or f"ZOTERO_BIBL {payload} CSL_BIBLIOGRAPHY RND{suffix}"

    bookmark = document.createInstance("com.sun.star.text.Bookmark")
    bookmark.setName(name)

    text.insertString(view_cursor, formattedText, False)
    view_cursor.goLeft(len(formattedText), True)
    text.insertTextContent(view_cursor, bookmark, True)
    view_cursor.collapseToEnd()

    return json.dumps({
        "status": "ok",
        "action": "insert_bibliography",
        "markName": name,
    })


def update_bibliography(markName, newMarkName=None, formattedText=None, doc=None):
    """
    Updates the visible text and optional name of the bibliography bookmark/mark.
    """
    document = get_current_doc(doc)
    bookmarks = document.getBookmarks()
    ref_marks = document.getReferenceMarks()

    target = None
    is_bookmark = False

    if bookmarks.hasByName(markName):
        target = bookmarks.getByName(markName)
        is_bookmark = True
    elif ref_marks.hasByName(markName):
        target = ref_marks.getByName(markName)
        is_bookmark = False

    if not target:
        return json.dumps({
            "status": "error",
            "action": "update_bibliography",
            "message": f"Bibliography '{markName}' not found",
        })

    anchor = target.getAnchor()
    text = document.getText()

    if formattedText is not None:
        anchor.setString(formattedText)

    final_name = newMarkName or markName
    if final_name != markName:
        type_str = "com.sun.star.text.Bookmark" if is_bookmark else "com.sun.star.text.ReferenceMark"
        new_content = document.createInstance(type_str)
        new_content.setName(final_name)
        text.removeTextContent(target)
        text.insertTextContent(anchor, new_content, True)

    return json.dumps({
        "status": "ok",
        "action": "update_bibliography",
        "markName": final_name,
    })


def get_document_fields(doc=None):
    """
    Scans the document for all Zotero ReferenceMarks and Bookmarks.
    """
    document = get_current_doc(doc)
    ref_marks = document.getReferenceMarks()
    bookmarks = document.getBookmarks()

    fields = []

    for name in ref_marks.getElementNames():
        if name.startswith("ZOTERO_ITEM") or name.startswith("ZOTERO_BIBL") or name.startswith("ZOTERO_PREF"):
            mark = ref_marks.getByName(name)
            anchor = mark.getAnchor()
            fields.append({
                "name": name,
                "text": anchor.getString() if anchor else "",
                "type": "citation" if "CSL_CITATION" in name else ("bibliography" if "ZOTERO_BIBL" in name else "pref"),
                "kind": "reference-mark",
            })

    for name in bookmarks.getElementNames():
        if name.startswith("ZOTERO_BIBL") or name.startswith("ZOTERO_BREF"):
            bm = bookmarks.getByName(name)
            anchor = bm.getAnchor()
            fields.append({
                "name": name,
                "text": anchor.getString() if anchor else "",
                "type": "bibliography",
                "kind": "bookmark",
            })

    return json.dumps({
        "status": "ok",
        "action": "get_document_fields",
        "fields": fields,
    })


def set_document_prefs(prefJson, markName=None, doc=None):
    """
    Stores document citation preferences as a ReferenceMark: ZOTERO_PREF {json} RND...
    """
    document = get_current_doc(doc)
    suffix = generate_rnd()
    name = markName or f"ZOTERO_PREF {prefJson} RND{suffix}"

    ref_marks = document.getReferenceMarks()
    # Remove existing pref marks
    for existing in ref_marks.getElementNames():
        if existing.startswith("ZOTERO_PREF"):
            try:
                mark = ref_marks.getByName(existing)
                document.getText().removeTextContent(mark)
            except Exception:
                pass

    ref_mark = document.createInstance("com.sun.star.text.ReferenceMark")
    ref_mark.setName(name)

    # Attach to start of document text
    cursor = document.getText().createTextCursor()
    cursor.collapseToStart()
    document.getText().insertTextContent(cursor, ref_mark, False)

    return json.dumps({
        "status": "ok",
        "action": "set_document_prefs",
        "markName": name,
    })
