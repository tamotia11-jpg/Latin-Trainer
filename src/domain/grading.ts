import type { Grade, Skill, Word } from "./types.ts";
export const stripAccents = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
export function normEnglish(s: string) {
  return stripAccents(s.toLowerCase())
    .replace(/[’‘`]/g, "'")
    .replace(/\.\.\.|…/g, " ")
    .replace(/[-–—]/g, " ")
    .replace(/[.?!"()=;:,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:(?:to|the|a|an)\s+)+/, "");
}
// Preserve spaces and letters: never join arbitrary tokens or delete numbers into a valid word.
export function normLatin(s: string) {
  return stripAccents(s.toLowerCase())
    .replace(/\.\.\.|…/g, " ... ")
    .replace(/[?!.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export function splitTop(s: string) {
  const out: string[] = [];
  let d = 0,
    p = "";
  for (const c of s) {
    if (c === "(") d++;
    if (c === ")") d--;
    if (c === "," && d === 0) {
      out.push(p.trim());
      p = "";
    } else p += c;
  }
  if (p.trim()) out.push(p.trim());
  return out.filter(Boolean);
}
function expandSlash(s: string): string[] {
  const m = s.match(/([^\s/]+)\/([^\s/]+)/);
  if (!m) return [s];
  return [
    ...expandSlash(s.replace(m[0], m[1])),
    ...expandSlash(s.replace(m[0], m[2])),
  ];
}
export function englishTargets(w: Word) {
  const out = new Set<string>();
  for (const p of w.meanings) {
    const plain = p.replace(/\([^)]*\)/g, "").trim();
    const text = p.replace(/[()]/g, " ");
    for (const c of [plain || text, text])
      for (const s of expandSlash(c)) {
        const n = normEnglish(s);
        if (n) {
          out.add(n);
          if (n.startsWith("be ") && n.length > 5) out.add(n.slice(3));
        }
      }
    if (p.includes("prefix = away")) out.add("away");
    if (!plain && p.includes("introduces question")) out.add("question");
  }
  return [...out];
}
export const latinTargets = (w: Word) => w.latin.split(",").map(normLatin);
export function forms(w: Word) {
  return splitTop(
    w.principalForms.replace(/\s*\+.*/, "").replace(/\([^)]*\)/g, ""),
  );
}
export function expected(w: Word, skill: Skill): string[] {
  switch (skill) {
    case "le":
      return englishTargets(w);
    case "el":
      return latinTargets(w);
    case "parts":
      return [forms(w).join(", ")];
    case "gender":
      return w.gender
        ? [
            w.gender,
            ...(w.gender === "m and f"
              ? ["masculine and feminine"]
              : w.gender === "m"
                ? ["masculine"]
                : w.gender === "f"
                  ? ["feminine"]
                  : ["neuter"]),
          ]
        : [];
    case "declension":
      return w.declension ? [w.declension] : [];
    case "conjugation":
      return w.conjugation ? [w.conjugation] : [];
    case "case":
      return w.governingCase ? [w.governingCase] : [];
    case "status":
      return [
        w.tags.includes("deponent")
          ? "deponent"
          : w.tags.includes("irregular")
            ? "irregular"
            : "regular",
      ];
  }
}
export function distance(a: string, b: string) {
  if (a.length > 500 || b.length > 500) return 999;
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = d[j];
      d[j] = Math.min(
        d[j] + 1,
        d[j - 1] + 1,
        last + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      last = temp;
    }
  }
  return d[b.length];
}
export function grade(
  w: Word,
  skill: Skill,
  raw: string,
  all: Word[],
  hinted = false,
  skipped = false,
): Grade {
  const target = expected(w, skill);
  const correct =
    skill === "le" ? w.meaningText : skill === "el" ? w.latin : target[0] || "";
  if (skipped || !raw.trim()) return { outcome: "Skipped", correct };
  if (raw.length > 500)
    return {
      outcome: "Wrong",
      correct,
      explanation: "Keep answers under 500 characters.",
    };
  const normal = (s: string) =>
    skill === "le" || !["el", "parts"].includes(skill)
      ? normEnglish(s)
      : normLatin(s);
  const input = normal(raw);
  let exact = false;
  if (skill === "parts") {
    const supplied = splitTop(raw).map(normLatin);
    const wanted = forms(w).map(normLatin);
    exact =
      supplied.length === wanted.length &&
      supplied.every(
        (x, i) => x === wanted[i] || optionalForm(wanted[i]).includes(x),
      );
  } else exact = target.some((t) => normal(t) === input);
  if (exact) return { outcome: hinted ? "Hinted" : "Exact", correct };
  // Another valid Latin headword must never be promoted to typo success, even with identical English meaning.
  if (skill === "el") {
    const other = all.find(
      (o) => o.id !== w.id && latinTargets(o).includes(input),
    );
    if (other) {
      const overlap = englishTargets(other).some((t) =>
        englishTargets(w).includes(t),
      );
      return {
        outcome: hinted ? "Hinted" : "Wrong",
        correct,
        confusionId: other.id,
        explanation: `You entered ${other.latin} (${other.meaningText}). ${overlap ? "Its meanings overlap, but this question targets" : "The target is"} ${w.latin} (${w.meaningText}; ${w.type || "phrase"}).`,
      };
    }
  }
  if (hinted) return { outcome: "Hinted", correct };
  // Reject lists that include a wrong meaning instead of passing any single matching fragment.
  const ds = target
    .map((t) => ({ t: normal(t), d: distance(input, normal(t)) }))
    .sort((a, b) => a.d - b.d);
  const best = ds[0];
  const limit = best && best.t.length >= 5 ? 1 : 0;
  const safe =
    skill === "le"
      ? !all.some((o) => o.id !== w.id && englishTargets(o).includes(input))
      : /^[a-z\s]+$/.test(input) &&
        input.split(" ").length === best?.t.split(" ").length;
  return best && best.d <= limit && safe && skill !== "parts"
    ? { outcome: "Minor typo", correct: best.t, distance: best.d }
    : { outcome: "Wrong", correct };
}
function optionalForm(s: string) {
  if (s === "ii") return ["ivi"];
  return [];
}
export function spellingDiff(a: string, b: string) {
  const dp = Array.from(
    { length: a.length + 1 },
    () => Array(b.length + 1).fill(0) as number[],
  );
  for (let i = a.length; i >= 0; i--)
    for (let j = b.length; j >= 0; j--)
      dp[i][j] =
        i === a.length
          ? b.length - j
          : j === b.length
            ? a.length - i
            : a[i] === b[j]
              ? dp[i + 1][j + 1]
              : 1 + Math.min(dp[i + 1][j], dp[i][j + 1], dp[i + 1][j + 1]);
  const out: { text: string; kind: "same" | "extra" | "missing" }[] = [];
  let i = 0,
    j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ text: a[i++], kind: "same" });
      j++;
    } else if (
      i < a.length &&
      (j === b.length || dp[i][j] === 1 + dp[i + 1][j])
    )
      out.push({ text: a[i++], kind: "extra" });
    else if (j < b.length && (i === a.length || dp[i][j] === 1 + dp[i][j + 1]))
      out.push({ text: b[j++], kind: "missing" });
    else {
      out.push({ text: a[i++], kind: "extra" });
      out.push({ text: b[j++], kind: "missing" });
    }
  }
  return out;
}
