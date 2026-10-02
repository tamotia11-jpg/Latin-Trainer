import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const source = readFileSync(
  new URL("../reference/teacher-trainer.html", import.meta.url),
  "utf8",
);
const raw = JSON.parse(source.match(/const V = (\[.*?\]);/s)[1]);
assert.equal(raw.length, 450);
assert.equal(new Set(raw.map((x) => x.i)).size, 450);
assert.equal(new Set(raw.map((x) => x.s)).size, 15);
function split(s) {
  let depth = 0,
    part = "",
    out = [];
  for (const c of s) {
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "," && depth === 0) {
      out.push(part.trim());
      part = "";
    } else part += c;
  }
  if (part.trim()) out.push(part.trim());
  return out;
}
const words = raw.map((w) => {
  assert.ok(w.l && w.e && w.s >= 1 && w.s <= 15);
  for (const k of ["l", "p", "t", "e"]) assert.equal(typeof w[k], "string");
  const pos = w.t.split(" ")[0] || "unknown";
  return {
    id: w.i,
    latin: w.l,
    principalForms: w.p,
    meanings: split(w.e),
    meaningText: w.e,
    partOfSpeech: pos,
    type: w.t,
    declension: pos === "noun" ? w.t.match(/\d/)?.[0] || null : null,
    conjugation: pos === "verb" ? w.t.match(/\d/)?.[0] || null : null,
    gender:
      pos === "noun" ? w.p.match(/,\s*(m and f|m|f|n)\b/)?.[1] || null : null,
    governingCase:
      w.p.match(
        /\+\s*(accusative\/ablative|accusative|ablative|dative)/,
      )?.[1] || null,
    grammaticalNotes: w.p,
    section: w.s,
    tags: [
      ...(w.t.includes("deponent") ? ["deponent"] : []),
      ...(w.t.includes("irregular") ? ["irregular"] : []),
      ...(w.t.includes("plural") || w.p.includes("plural") ? ["plural"] : []),
    ],
    source: w,
  };
});
const json = JSON.stringify(words, null, 2) + "\n";
const report = {
  source: "Teacher-created GCSE Latin Vocab Trainer.html",
  sha256: createHash("sha256").update(source).digest("hex"),
  records: words.length,
  sections: Object.fromEntries(
    Array.from({ length: 15 }, (_, i) => [
      i + 1,
      words.filter((w) => w.section === i + 1).length,
    ]),
  ),
  missingTypes: words.filter((w) => !w.type).map((w) => w.id),
  duplicateHeadwords: words
    .filter((w) => words.some((o) => o.id < w.id && o.latin === w.latin))
    .map((w) => ({ id: w.id, latin: w.latin })),
  notes: [
    "Unequal section sizes are preserved, not forced to 30.",
    "Duplicate headwords represent distinct entries, not duplicate IDs.",
    "No metadata beyond explicit HTML fields is inferred.",
    "Supplementary DOCX contains indeclinable annotations absent from HTML and ilIa vs illa at entry 163; HTML values retained.",
  ],
};
const target = new URL("../src/data/vocabulary.json", import.meta.url);
if (process.argv.includes("--check"))
  assert.equal(readFileSync(target, "utf8"), json);
else {
  writeFileSync(target, json);
  writeFileSync(
    new URL("../docs/import-report.json", import.meta.url),
    JSON.stringify(report, null, 2) + "\n",
  );
}
if (process.argv.includes("--check"))
  assert.equal(
    readFileSync(
      new URL("../docs/import-report.json", import.meta.url),
      "utf8",
    ),
    JSON.stringify(report, null, 2) + "\n",
  );
console.log(JSON.stringify(report));
