export type FeedbackTtsProviderName = "mock" | "xfyun";
export type FeedbackTtsSpeed = "normal" | "slow";

export interface TtsProvider {
    synthesize(input: {
        text: string;
        language: "zh";
        speed?: FeedbackTtsSpeed;
        voice?: string;
    }): Promise<{
        audioUrl: string;
        durationMs: number;
        provider: FeedbackTtsProviderName;
        raw?: unknown;
    }>;
}