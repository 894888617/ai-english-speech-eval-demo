export type ProviderName = "mock" | "xfyun" | "tencent" | "youdao";
export type SpeechSpeed = "normal" | "slow";
export type VoiceGender = "female" | "male";

export interface ScoreSet {
  total: number;
  accuracy: number;
  fluency: number;
  integrity: number;
  clarity: number;
}

export interface WordScore {
  word: string;
  score: number;
  status: "ok" | "warning" | "bad";
  suggestion?: string;
}

export interface TtsProvider {
  name: ProviderName;
  synthesize(input: {
    text: string;
    speed: SpeechSpeed;
    voice: VoiceGender;
  }): Promise<{
    audioUrl: string;
    durationMs: number;
    provider: string;
    message?: string;
    errorCode?: string;
    raw?: unknown;
  }>;
}

export interface SpeechEvaluationProvider {
  name: ProviderName;
  evaluate(input: {
    text: string;
    audioPath: string;
    audioMimeType: string;
  }): Promise<{
    status: "complete" | "failed";
    scores: ScoreSet;
    asrText: string;
    wordScores: WordScore[];
    suggestions: string[];
    timing: {
      evaluationMs: number;
      totalMs: number;
    };
    message?: string;
    errorCode?: string;
    raw?: unknown;
  }>;
}

export interface EvaluationLog {
  id: string;
  text: string;
  source: "browser" | "upload";
  provider: string;
  scores: ScoreSet;
  asrText: string;
  createdAt: string;
  timing: {
    uploadMs: number;
    evaluationMs: number;
    totalMs: number;
  };
  originalAudioMimeType?: string;
  convertedAudioFormat?: string;
  convertedAudioPath?: string;
  xfyunSid?: string;
  xfyunCode?: number;
  errorMessage?: string;
}
