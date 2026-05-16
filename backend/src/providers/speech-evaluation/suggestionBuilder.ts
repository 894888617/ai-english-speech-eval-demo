import { ScoreSet, WordScore } from "../../types.js";

export function buildSuggestions(scores: ScoreSet, wordScores: WordScore[], options: { noWordDetails?: boolean } = {}) {
  const suggestions: string[] = [];
  if (scores.accuracy < 75) suggestions.push("发音准确度偏低，建议先跟读标准音，再把低分词单独慢速练习 3 次。");
  if (scores.fluency < 75) suggestions.push("流利度偏低，建议放慢语速，减少中间停顿，再完整读一遍句子。");
  if (scores.integrity < 90) suggestions.push("完整度不足，可能存在漏读，请确认每个单词都完整读出。");

  const badWords = wordScores.filter((item) => item.status === "bad").map((item) => item.word).slice(0, 8);
  if (badWords.length > 0) suggestions.push(`以下单词建议重点练习：${badWords.join("、")}。`);
  if (options.noWordDetails) suggestions.push("当前接口结果未返回单词级明细，请检查讯飞评测参数是否开启或当前题型是否支持。");
  if (scores.total >= 85) suggestions.push("整体表现不错，可以继续尝试更长的句子。");
  if (suggestions.length === 0) suggestions.push("建议继续跟读标准音，保持稳定语速，并重点复盘低分维度。");
  return suggestions;
}
