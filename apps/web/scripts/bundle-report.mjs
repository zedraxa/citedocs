import console from "node:console";
import { URL } from "node:url";
import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const dir = new URL("../dist/assets/", import.meta.url);
const rows = readdirSync(dir)
  .filter((file) => /\.(js|css)$/.test(file))
  .map((file) => {
    const content = readFileSync(new URL(file, dir));
    return { file, bytes: content.length, gzip: gzipSync(content).length };
  });
console.table(rows);
for (const extension of ["js", "css"]) {
  const files = rows.filter((row) => row.file.endsWith(`.${extension}`));
  console.log(extension, {
    bytes: files.reduce((sum, row) => sum + row.bytes, 0),
    gzip: files.reduce((sum, row) => sum + row.gzip, 0),
  });
}

// Follow static imports only: dynamic routes must not count toward first load.
const html = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
const entry = html.match(/src="\/assets\/([^" ]+\.js)"/)?.[1];
if (!entry) throw new Error("Giriş paketi bulunamadı");
const initial = new Set();
function visit(file) {
  if (initial.has(file)) return;
  initial.add(file);
  const source = readFileSync(new URL(file, dir), "utf8");
  for (const match of source.matchAll(
    /(?:import|export)(?:[^;"']*?\bfrom\s*)?["']\.\/([^"']+\.js)["']/g,
  )) {
    visit(match[1]);
  }
}
visit(entry);
console.log("İlk yükleme", {
  entry,
  files: [...initial],
  bytes: rows.filter((row) => initial.has(row.file)).reduce((sum, row) => sum + row.bytes, 0),
  gzip: rows.filter((row) => initial.has(row.file)).reduce((sum, row) => sum + row.gzip, 0),
});
