import { ScoreSet, WordScore } from "../types.js";

export type ChineseFeedbackInput = {
    scores: ScoreSet;
    wordScores: Array<Pick<WordScore, "word" | "score" | "status">>;
    suggestions: string[];
    targetText: string;
};

export type ChineseFeedback = {
    text: string;
    language: "zh";
};

function uniqueBadWords(wordScores: ChineseFeedbackInput["wordScores"]) {
    const seen = new Set<string>();
    return wordScores
        .filter((item) => item.status === "bad" && item.word.trim())
        .map((item) => item.word.trim())
        .filter((word) => {
            const key = word.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, 3);
}

export function buildChineseFeedback(input: ChineseFeedbackInput): ChineseFeedback {
    const { scores } = input;
    const sentences: string[] = [];

    if (scores.total >= 85) {
        sentences.push("你读得很好，整体发音比较清楚，可以继续挑战更长的句子。");
    } else if (scores.total >= 75) {
        sentences.push("你这次读得不错，句子基本读完整了，还可以继续提升发音和流利度。");
    } else {
        sentences.push("这次还有提升空间，建议先听一遍标准读音，再慢速跟读三遍。");
    }

    const issueSentences: string[] = [];
    if (scores.accuracy < 75) issueSentences.push("发音准确度还可以提升，建议重点模仿标准音的发音位置。");
    if (scores.fluency < 75) issueSentences.push("流利度偏低，朗读时可以放慢语速，减少中间停顿。");
    if (scores.integrity < 90) issueSentences.push("完整度不足，可能存在漏读，请确认每个单词都读出来。");
    if (scores.clarity < 75) issueSentences.push("清晰度还可以提升，建议靠近麦克风，并保持安静环境。");

    const badWords = uniqueBadWords(input.wordScores);
    const badWordSentence = badWords.length > 0 ? `请重点练习这些单词：${badWords.join("、")}。` : "";

    if (issueSentences.length === 0 && !badWordSentence) {
        sentences.push("继续保持，可以再读一遍，让语音更自然。");
    } else if (badWordSentence) {
        sentences.push(...issueSentences.slice(0, 1), badWordSentence);
    } else {
        sentences.push(...issueSentences.slice(0, 2));
    }

    return { text: sentences.slice(0, 3).join(""), language: "zh" };
}