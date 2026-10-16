"""
Offline Unit Tests for zotero_collabora.py
"""

import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

from zotero_collabora import (
    insert_citation,
    update_citation,
    insert_bibliography,
    update_bibliography,
    get_document_fields,
    set_document_prefs,
)


class MockAnchor:
    def __init__(self, text=""):
        self._text = text

    def getString(self):
        return self._text

    def setString(self, val):
        self._text = val

    def getText(self):
        return self


class MockContent:
    def __init__(self, kind):
        self._kind = kind
        self._name = ""
        self._anchor = MockAnchor()

    def setName(self, name):
        self._name = name

    def getName(self):
        return self._name

    def getAnchor(self):
        return self._anchor


class MockContainer:
    def __init__(self):
        self._items = {}

    def hasByName(self, name):
        return name in self._items

    def getByName(self, name):
        return self._items[name]

    def getElementNames(self):
        return list(self._items.keys())

    def add(self, content):
        self._items[content.getName()] = content

    def remove(self, content):
        if content.getName() in self._items:
            del self._items[content.getName()]


class MockCursor:
    def __init__(self):
        self._pos = 0
        self._selected = ""

    def goLeft(self, count, expand):
        self._pos = max(0, self._pos - count)

    def collapseToEnd(self):
        self._selected = ""

    def collapseToStart(self):
        self._selected = ""


class MockText:
    def __init__(self):
        self._content = ""
        self.cursor = MockCursor()

    def insertString(self, cursor, string_val, absorb):
        self._content += string_val

    def insertTextContent(self, range_val, content, absorb):
        if hasattr(range_val, "getString"):
            content.getAnchor().setString(range_val.getString())
        elif hasattr(self, "_active_doc"):
            if "ReferenceMark" in content._kind:
                self._active_doc._ref_marks.add(content)
            elif "Bookmark" in content._kind:
                self._active_doc._bookmarks.add(content)

    def removeTextContent(self, content):
        if hasattr(self, "_active_doc"):
            self._active_doc._ref_marks.remove(content)
            self._active_doc._bookmarks.remove(content)

    def createTextCursor(self):
        return MockCursor()


class MockController:
    def __init__(self, cursor):
        self._cursor = cursor

    def getViewCursor(self):
        return self._cursor


class MockDocument:
    def __init__(self):
        self._text = MockText()
        self._text._active_doc = self
        self._cursor = MockCursor()
        self._controller = MockController(self._cursor)
        self._ref_marks = MockContainer()
        self._bookmarks = MockContainer()

    def getCurrentController(self):
        return self._controller

    def getText(self):
        return self._text

    def getReferenceMarks(self):
        return self._ref_marks

    def getBookmarks(self):
        return self._bookmarks

    def createInstance(self, service_name):
        return MockContent(service_name)


class TestZoteroCollabora(unittest.TestCase):
    def setUp(self):
        self.doc = MockDocument()

    def test_insert_citation(self):
        payload = '{"citationID":"cit1","properties":{"formattedCitation":"(Smith, 2020)"}}'
        res_str = insert_citation(payload, "(Smith, 2020)", rndSuffix="RND123", doc=self.doc)
        res = json.loads(res_str)

        self.assertEqual(res["status"], "ok")
        self.assertIn("ZOTERO_ITEM CSL_CITATION", res["markName"])
        self.assertIn("RND123", res["markName"])
        self.assertEqual(res["formattedText"], "(Smith, 2020)")

    def test_update_citation(self):
        # Insert initial mark
        mark = MockContent("com.sun.star.text.ReferenceMark")
        mark.setName("ZOTERO_ITEM CSL_CITATION {} RND1")
        mark.getAnchor().setString("(Smith, 2020)")
        self.doc.getReferenceMarks().add(mark)

        # Update it
        new_name = "ZOTERO_ITEM CSL_CITATION {} RND2"
        res_str = update_citation(
            "ZOTERO_ITEM CSL_CITATION {} RND1",
            new_name,
            "{}",
            "[1]",
            doc=self.doc,
        )
        res = json.loads(res_str)
        self.assertEqual(res["status"], "ok")
        self.assertEqual(res["markName"], new_name)
        self.assertEqual(res["formattedText"], "[1]")

    def test_insert_and_update_bibliography(self):
        res_str = insert_bibliography("Smith (2020). Title.", rndSuffix="RND999", doc=self.doc)
        res = json.loads(res_str)
        self.assertEqual(res["status"], "ok")
        self.assertIn("ZOTERO_BIBL", res["markName"])

        # Update
        mark_name = res["markName"]
        bm = MockContent("com.sun.star.text.Bookmark")
        bm.setName(mark_name)
        bm.getAnchor().setString("Smith (2020). Title.")
        self.doc.getBookmarks().add(bm)

        up_str = update_bibliography(mark_name, mark_name, "[1] Smith, 2020.", doc=self.doc)
        up = json.loads(up_str)
        self.assertEqual(up["status"], "ok")
        self.assertEqual(bm.getAnchor().getString(), "[1] Smith, 2020.")

    def test_get_document_fields(self):
        cit = MockContent("com.sun.star.text.ReferenceMark")
        cit.setName("ZOTERO_ITEM CSL_CITATION {} RND1")
        cit.getAnchor().setString("(Doe, 2021)")
        self.doc.getReferenceMarks().add(cit)

        fields_str = get_document_fields(doc=self.doc)
        fields_res = json.loads(fields_str)
        self.assertEqual(fields_res["status"], "ok")
        self.assertEqual(len(fields_res["fields"]), 1)
        self.assertEqual(fields_res["fields"][0]["type"], "citation")
        self.assertEqual(fields_res["fields"][0]["text"], "(Doe, 2021)")

    def test_set_document_prefs(self):
        pref_json = '{"style":"ieee","locale":"en-US"}'
        res_str = set_document_prefs(pref_json, doc=self.doc)
        res = json.loads(res_str)
        self.assertEqual(res["status"], "ok")
        self.assertIn("ZOTERO_PREF", res["markName"])


if __name__ == "__main__":
    unittest.main()
