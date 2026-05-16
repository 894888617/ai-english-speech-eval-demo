import { config } from "../../config.js";
import { RuntimeFeedbackConfig } from "../../runtime-config/RuntimeEvaluationConfigStore.js";
import { MockTtsProvider } from "./MockTtsProvider.js";
import { TtsProvider } from "./TtsProvider.js";

class LazyXfyunTtsProvider implements TtsProvider {
    readonly name = "xfyun" as const;
    constructor(private readonly options?: RuntimeFeedbackConfig["xfyun"]) {}

    async synthesize(input: Parameters<TtsProvider["synthesize"]>[0]) {
        const { XfyunTtsProvider } = await import("./XfyunTtsProvider.js");
        return new XfyunTtsProvider(this.options).synthesize(input);
    }
}

export function createFeedbackTtsProvider(options?: { runtimeConfig?: RuntimeFeedbackConfig }): TtsProvider & { name: "mock" | "xfyun" } {
    const runtime = options?.runtimeConfig;
    const provider = runtime?.provider || config.feedback.ttsProvider;
    if (provider === "xfyun") {
        return new LazyXfyunTtsProvider(runtime?.xfyun) as TtsProvider & { name: "xfyun" };
    }
    return new MockTtsProvider() as TtsProvider & { name: "mock" };
}