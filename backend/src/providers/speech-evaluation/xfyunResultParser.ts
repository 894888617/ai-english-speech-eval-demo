import { parseStringPromise } from "xml2js";
import { ScoreSet, WordScore } from "../../types.js";
import { buildSuggestions } from "./suggestionBuilder.js";

export interface XfyunRawMessage { code?: number; message?: string; sid?: string; data?: { status?: number; data?: string }; [key: string]: unknown; }

function round1(value: number) { return Math.round(value * 10) / 10; }
function clampScore(value: number | undefined, fallback = 0) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, round1(value as number)));
}
function scoreStatus(score: number): WordScore["status"] {
  if (score >= 85) return "ok";
  if (score >= 70) return "warning";
  return "bad";
}
function attrs(node: unknown): Record<string, unknown> {
  return node && typeof node === "object" && "$" in node ? ((node as { $?: Record<string, unknown> }).$ || {}) : {};
}
function asText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(" ") || undefined;
  if (value && typeof value === "object") {
    const a = attrs(value);
    for (const key of ["content", "text", "word", "beg_pos", "value"]) if (typeof a[key] === "string") return a[key] as string;
  }
  return undefined;
}
function numberFrom(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
function pickNumber(obj: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = numberFrom(obj[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}
function visit(node: unknown, cb: (name: string, node: unknown) => void, name = "root") {
  cb(name, node);
  if (Array.isArray(node)) node.forEach((item) => visit(item, cb, name));
  else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) if (key !== "$" && key !== "_") visit(value, cb, key);
  }
}

function collectAllAttributes(parsed: unknown) {
  const all: Record<string, unknown>[] = [];
  visit(parsed, (_name, node) => {
    const a = attrs(node);
    if (Object.keys(a).length) all.push(a);
  });
  return all;
}

function parseWordScores(parsed: unknown): WordScore[] {
  const words: WordScore[] = [];
  visit(parsed, (name, node) => {
    if (!/(word|rec_node|item)/i.test(name)) return;
    const a = attrs(node);
    const word = (a.content || a.word || a.text || asText((node as Record<string, unknown>)?._)) as string | undefined;
    const score = clampScore(pickNumber(a, ["total_score", "word_score", "accuracy_score", "phone_score", "standard_score", "score"]), -1);
    if (!word || score < 0) return;
    const cleanWord = word.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
    if (!cleanWord) return;
    const status = scoreStatus(score);
    words.push({ word: cleanWord, score, status, suggestion: status === "bad" ? "建议单独慢速跟读该词。" : status === "warning" ? "部分音节不稳定。" : undefined });
  });
  const seen = new Set<string>();
  return words.filter((item) => {
    const key = `${item.word.toLowerCase()}:${item.score}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pickNumberFromAttrs(attrsList: Record<string, unknown>[], keys: string[]) {
  for (const attr of attrsList) {
    const value = pickNumber(attr, keys);
    if (value !== undefined) return value;
  }
  return undefined;
}

function parseScores(parsed: unknown): ScoreSet {
  const attrsList = collectAllAttributes(parsed);
  const total = clampScore(pickNumberFromAttrs(attrsList, ["total_score", "final_score", "score", "standard_score"]));
  const accuracy = clampScore(pickNumberFromAttrs(attrsList, ["accuracy_score", "phone_score", "standard_score"]), total);
  const fluency = clampScore(pickNumberFromAttrs(attrsList, ["fluency_score"]), total || accuracy);
  const integrity = clampScore(pickNumberFromAttrs(attrsList, ["integrity_score"]), total || accuracy);
  const clarity = clampScore(pickNumberFromAttrs(attrsList, ["clarity_score", "phone_score", "accuracy_score"]), accuracy || total);
  return { total, accuracy, fluency, integrity, clarity };
}

function findAsrText(parsed: unknown, fallback: string) {
  let candidate = "";
  visit(parsed, (name, node) => {
    if (candidate) return;
    if (!/(read_sentence|sentence|rec_paper|content)/i.test(name)) return;
    const a = attrs(node);
    const text = (a.content || a.text || a.beg_pos || asText(node)) as string | undefined;
    if (text && /[A-Za-z]/.test(text)) candidate = text;
  });
  return candidate || fallback;
}

export async function parseXfyunResult(input: { messages: XfyunRawMessage[]; text: string; xml?: string; evaluationMs: number; totalMs: number; conversion?: unknown }) {
  const finalMessage = [...input.messages].reverse().find((item) => item.data?.status === 2) || input.messages[input.messages.length - 1];
  const encoded = input.xml ? undefined : finalMessage?.data?.data;
  const xml = input.xml || (encoded ? Buffer.from(encoded, "base64").toString("utf8") : "");
  if (!xml) throw new Error("Xfyun response did not include evaluation XML");
  const parsed = await parseStringPromise(xml, { explicitArray: false, trim: true, explicitRoot: true });
  const scores = parseScores(parsed);
  if (!scores.total && !scores.accuracy && !scores.fluency) throw new Error("Xfyun response did not include score fields");
  const wordScores = parseWordScores(parsed);
  const asrText = findAsrText(parsed, input.text);
  return {
    status: "complete" as const,
    scores,
    asrText,
    wordScores,
    suggestions: buildSuggestions(scores, wordScores, { noWordDetails: wordScores.length === 0 }),
    timing: { evaluationMs: input.evaluationMs, totalMs: input.totalMs },
    raw: { sid: finalMessage?.sid, code: finalMessage?.code, message: finalMessage?.message, xml, parsed, messages: input.messages, conversion: input.conversion }
  };
}
