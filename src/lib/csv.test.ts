import { describe, expect, it } from "vitest";
import { CsvModel, detectDelimiter, parseClipboardBlock, parseCsv as parseWithRaw, serializeCsv } from "./csv";

/** Parsed rows carry their source line as a `raw` property; strip it so
 *  assertions compare cells only. */
function parseCsv(text: string) {
  const doc = parseWithRaw(text);
  return { ...doc, plainHeader: [...doc.header], plainRows: doc.rows.map((r) => [...r]) };
}

describe("parseCsv", () => {
  it("parses a header and rows", () => {
    const doc = parseCsv("a,b,c\n1,2,3\n4,5,6\n");
    expect(doc.plainHeader).toEqual(["a", "b", "c"]);
    expect(doc.plainRows).toEqual([
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
    expect(doc.trailingNewline).toBe(true);
    expect(doc.newline).toBe("\n");
  });

  it("handles quotes, escaped quotes, embedded delimiters and newlines", () => {
    const doc = parseCsv('name,note\n"Smith, J","said ""hi""\nthen left"\n');
    expect(doc.plainRows).toEqual([["Smith, J", 'said "hi"\nthen left']]);
  });

  it("keeps empty fields and ragged rows", () => {
    const doc = parseCsv("a,b,c\n1,,\n2\n,\n");
    expect(doc.plainRows).toEqual([["1", "", ""], ["2"], ["", ""]]);
  });

  it("detects CRLF, BOM and a missing trailing newline", () => {
    const doc = parseCsv("﻿a,b\r\n1,2");
    expect(doc.bom).toBe(true);
    expect(doc.plainHeader).toEqual(["a", "b"]);
    expect(doc.newline).toBe("\r\n");
    expect(doc.trailingNewline).toBe(false);
    expect(doc.plainRows).toEqual([["1", "2"]]);
  });

  it("is lenient with stray and unterminated quotes", () => {
    expect(parseCsv('a\n5" screen\n').plainRows).toEqual([['5" screen']]);
    expect(parseCsv('a\n"open\nstill').plainRows).toEqual([["open\nstill"]]);
  });

  it("parses an empty file to an empty document", () => {
    const doc = parseCsv("");
    expect(doc.plainHeader).toEqual([]);
    expect(doc.plainRows).toEqual([]);
    expect(serializeCsv(doc)).toBe("");
  });
});

describe("detectDelimiter", () => {
  it("picks semicolons and tabs, ignoring quoted ones", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a\tb\n")).toBe("\t");
    expect(detectDelimiter('"x;y;z",b\n')).toBe(",");
    expect(detectDelimiter("single")).toBe(",");
  });
});

describe("serializeCsv round-trip", () => {
  const samples = [
    "a,b,c\n1,2,3\n",
    "a,b\r\n1,2\r\n",
    '"quoted","unneeded quotes"\n"x",  spaced  \n',
    "﻿a;b\n1;2",
    'a\n"multi\nline"\n',
    "a,b,c\n1\n\n2,3\n",
  ];
  for (const sample of samples) {
    it(`reproduces ${JSON.stringify(sample)} byte for byte`, () => {
      expect(serializeCsv(parseWithRaw(sample))).toBe(sample);
    });
  }
});

describe("CsvModel", () => {
  it("edits one cell and leaves every other line's formatting alone", () => {
    const text = '"a","b"\n"1","2"\n"3","4"\n';
    const model = CsvModel.fromText(text);
    model.setCell(1, 1, "x");
    expect(model.serialize()).toBe('"a","b"\n"1","2"\n3,x\n');
  });

  it("quotes values that need it", () => {
    const model = CsvModel.fromText("a,b\n1,2\n");
    model.setCell(0, 0, 'he said "no", twice');
    expect(model.serialize()).toBe('a,b\n"he said ""no"", twice",2\n');
  });

  it("edits header cells as row -1", () => {
    const model = CsvModel.fromText("a,b\n1,2\n");
    model.setCell(-1, 1, "Bee");
    expect(model.serialize()).toBe("a,Bee\n1,2\n");
  });

  it("extends short rows and widens the table when editing past the end", () => {
    const model = CsvModel.fromText("a,b\n1\n");
    model.setCell(0, 3, "z");
    expect(model.columnCount).toBe(4);
    expect(model.serialize()).toBe("a,b\n1,,,z\n");
  });

  it("undoes and redoes cell edits, restoring the original row text", () => {
    const model = CsvModel.fromText('a\n"1"\n');
    model.setCell(0, 0, "2");
    expect(model.undo()).toEqual({ row: 0, col: 0 });
    expect(model.serialize()).toBe('a\n"1"\n');
    model.redo();
    expect(model.serialize()).toBe("a\n2\n");
  });

  it("inserts and deletes rows", () => {
    const model = CsvModel.fromText("a,b\n1,2\n3,4\n");
    model.insertRow(1);
    expect(model.serialize()).toBe("a,b\n1,2\n,\n3,4\n");
    model.deleteRow(0);
    expect(model.serialize()).toBe("a,b\n,\n3,4\n");
    model.undo();
    model.undo();
    expect(model.serialize()).toBe("a,b\n1,2\n3,4\n");
  });

  it("inserts and deletes columns", () => {
    const model = CsvModel.fromText("a,b\n1,2\n3\n");
    model.insertColumn(1);
    expect(model.serialize()).toBe("a,,b\n1,,2\n3,\n");
    model.deleteColumn(0);
    expect(model.serialize()).toBe(",b\n,2\n\n");
    model.undo();
    model.undo();
    expect(model.serialize()).toBe("a,b\n1,2\n3\n");
  });

  it("refuses to delete the last column", () => {
    const model = CsvModel.fromText("a\n1\n");
    model.deleteColumn(0);
    expect(model.serialize()).toBe("a\n1\n");
  });

  it("sorts the view numerically or by text, empties last, without touching the file", () => {
    const model = CsvModel.fromText("n,s\n10,b\n2,a\n,c\n1,B\n");
    model.setSort({ column: 0, direction: "asc" });
    expect([0, 1, 2, 3].map((r) => model.getCell(r, 0))).toEqual(["1", "2", "10", ""]);
    model.setSort({ column: 0, direction: "desc" });
    expect([0, 1, 2, 3].map((r) => model.getCell(r, 0))).toEqual(["10", "2", "1", ""]);
    model.setSort({ column: 1, direction: "asc" });
    expect([0, 1, 2, 3].map((r) => model.getCell(r, 1))).toEqual(["a", "b", "B", "c"]);
    expect(model.serialize()).toBe("n,s\n10,b\n2,a\n,c\n1,B\n");
  });

  it("edits through a sorted view hit the right underlying row", () => {
    const model = CsvModel.fromText("n\n3\n1\n2\n");
    model.setSort({ column: 0, direction: "asc" });
    model.setCell(0, 0, "one");
    expect(model.serialize()).toBe("n\n3\none\n2\n");
    // Frozen: the edited row stays put rather than re-sorting.
    expect(model.getCell(0, 0)).toBe("one");
  });

  it("inserts and deletes rows in a sorted view where the cursor is", () => {
    const model = CsvModel.fromText("n\n3\n1\n2\n");
    model.setSort({ column: 0, direction: "asc" }); // view: 1,2,3
    model.insertRow(1); // below "1"
    expect([0, 1, 2, 3].map((r) => model.getCell(r, 0))).toEqual(["1", "", "2", "3"]);
    expect(model.serialize()).toBe("n\n3\n1\n\n2\n");
    model.deleteRow(3); // "3"
    expect([0, 1, 2].map((r) => model.getCell(r, 0))).toEqual(["1", "", "2"]);
    expect(model.serialize()).toBe("n\n1\n\n2\n");
  });

  it("keeps the sort column pointing at the same data across column edits", () => {
    const model = CsvModel.fromText("a,b\n2,x\n1,y\n");
    model.setSort({ column: 1, direction: "desc" });
    model.insertColumn(0);
    expect(model.sort).toEqual({ column: 2, direction: "desc" });
    model.deleteColumn(2);
    expect(model.sort).toBeNull();
  });

  it("pastes a block, appending rows as needed, as one undo step", () => {
    const model = CsvModel.fromText("a,b\n1,2\n");
    model.pasteBlock(0, 1, parseClipboardBlock("x\ty\nz\tw\n"));
    expect(model.serialize()).toBe("a,b\n1,x,y\n,z,w\n");
    model.undo();
    expect(model.serialize()).toBe("a,b\n1,2\n");
  });

  it("builds a valid file up from an empty one", () => {
    const model = CsvModel.fromText("");
    model.setCell(-1, 0, "Name");
    model.insertRow(0);
    model.setCell(0, 0, "Ada");
    expect(model.serialize()).toBe("Name\nAda\n");
  });
});

describe("performance", () => {
  it("parses, serializes and sorts 100k rows quickly", () => {
    const lines = ["id,name,email,amount,note"];
    for (let i = 0; i < 100_000; i++) {
      lines.push(`${i},Person ${i},person${i}@example.com,${(i * 7919) % 10007},"note, with comma ${i}"`);
    }
    const text = lines.join("\n") + "\n";

    let t = performance.now();
    const model = CsvModel.fromText(text);
    const parseMs = performance.now() - t;

    t = performance.now();
    model.setCell(500, 1, "edited");
    const out = model.serialize();
    const serializeMs = performance.now() - t;

    t = performance.now();
    model.setSort({ column: 1, direction: "asc" });
    const sortMs = performance.now() - t;

    console.log(
      `100k rows (${(text.length / 1e6).toFixed(1)} MB): parse ${parseMs.toFixed(0)}ms, ` +
        `serialize ${serializeMs.toFixed(0)}ms, text sort ${sortMs.toFixed(0)}ms`,
    );
    expect(model.rowCount).toBe(100_000);
    expect(out.length).toBe(text.length + "edited".length - "Person 500".length);
    expect(parseMs).toBeLessThan(500);
  });
});
