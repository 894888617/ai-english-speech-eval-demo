import fs from "node:fs/promises";
import { SpeechEvaluationProvider, WordScore } from "../types.js";

function clamp(value: number, min = 45, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function wordsFromText(text: string) {
  return text.match(/[A-Za-z']+/g) || ["Hello"];
}

function deterministicNoise(seed: string, index: number) {
  let hash = 0;
  for (const char of `${seed}:${index}`) hash = (hash * 31 + char.charCodeAt(0)) % 9973;
  return (hash % 17) - 8;
}

function statusFromScore(score: number): WordScore["status"] {
  if (score < 70) return "bad";
  if (score <= 85) return "warning";
  return "ok";
}

export class MockSpeechEvaluationProvider implements SpeechEvaluationProvider {
  name = "mock" as const;

  async evaluate(input: { text: string; audioPath: string; audioMimeType: string }) {
    const startedAt = Date.now();
    const words = wordsFromText(input.text);
    const stat = await fs.stat(input.audioPath).catch(() => ({ size: 20_000 }));
    const pseudoDurationSec = clamp((stat.size as number) / 18_000, 0.8, 12);
    const idealDurationSec = Math.max(words.length * 0.55, 0.8);
    const pacePenalty = Math.min(Math.abs(pseudoDurationSec - idealDurationSec) * 8, 18);
    const base = clamp(88 - pacePenalty + deterministicNoise(input.text, Math.round(stat.size as number)) / 2, 55, 96);

    const wordScores = words.map((word, index) => {
      const score = round1(clamp(base + deterministicNoise(word, index) - (index === words.length - 1 ? 4 : 0), 48, 98));
      return {
        word,
        score,
        status: statusFromScore(score),
        suggestion: score < 70 ? "建议单独慢速跟读该词。" : score <= 85 ? "部分音节不稳定。" : undefined
      };
    });

    if (words.length > 2 && !wordScores.some((item) => item.score < 70)) {
      wordScores[words.length - 1] = {
        ...wordScores[words.length - 1],
        score: 66,
        status: "bad",
        suggestion: "目标词可能漏读或读音不清晰。"
      };
    }

    const lowCount = wordScores.filter((item) => item.status === "bad").length;
    const warningCount = wordScores.filter((item) => item.status === "warning").length;
    const accuracy = round1(clamp(base - lowCount * 4, 45, 98));
    const fluency = round1(clamp(86 - pacePenalty + deterministicNoise(input.audioMimeType, words.length), 50, 96));
    const integrity = round1(clamp(100 - lowCount * 8 - warningCount * 2, 60, 100));
    const clarity = round1(clamp(base - warningCount * 1.5, 50, 97));
    const total = round1(accuracy * 0.4 + fluency * 0.25 + integrity * 0.2 + clarity * 0.15);

    const isHello = input.text.trim().toLowerCase() === "hello." || input.text.trim().toLowerCase() === "hello";
    const asrText = isHello && deterministicNoise(input.audioPath, 1) < 0 ? "The." : input.text.trim();

    const suggestions = [
      ...(accuracy < 85 ? ["发音准确度偏低，建议先跟读标准音，再把低分词单独慢速练习 3 次。"] : []),
      ...(fluency < 80 ? ["流利度偏低，建议放慢语速，减少中间停顿。"] : []),
      ...wordScores
        .filter((item) => item.status === "bad")
        .slice(0, 2)
        .map((item) => `目标词 "${item.word.toLowerCase()}" 可能漏读或读音不清晰，请重点练习。`)
    ];

    if (suggestions.length === 0) {
      suggestions.push("整体表现不错，建议继续跟读标准音，保持稳定语速。");
    }

    const evaluationMs = 850 + words.length * 95 + Math.abs(deterministicNoise(input.text, 99)) * 20;
    const elapsed = Date.now() - startedAt;
    return {
      status: "complete" as const,
      scores: { total, accuracy, fluency, integrity, clarity },
      asrText,
      wordScores,
      suggestions,
      timing: { evaluationMs, totalMs: evaluationMs + elapsed },
      raw: { mock: true, pseudoDurationSec, idealDurationSec }
    };
  }
}
