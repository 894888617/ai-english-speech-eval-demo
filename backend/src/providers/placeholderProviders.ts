import { SpeechEvaluationProvider, TtsProvider } from "../types.js";
import { MockSpeechEvaluationProvider } from "./mockSpeechEvaluationProvider.js";
import { MockTtsProvider } from "./mockTtsProvider.js";

export class XfyunSpeechEvaluationProvider implements SpeechEvaluationProvider {
  name = "xfyun" as const;
  private fallback = new MockSpeechEvaluationProvider();

  async evaluate(input: Parameters<SpeechEvaluationProvider["evaluate"]>[0]) {
    // Reserved for Xfyun ISE/API integration. Fallback keeps the demo usable when credentials are absent or integration is incomplete.
    const result = await this.fallback.evaluate(input);
    return { ...result, raw: { ...result.raw, placeholderProvider: this.name } };
  }
}

export class TencentTtsProvider implements TtsProvider {
  name = "tencent" as const;
  private fallback = new MockTtsProvider();

  async synthesize(input: Parameters<TtsProvider["synthesize"]>[0]) {
    const result = await this.fallback.synthesize(input);
    return { ...result, provider: this.name, raw: { ...result.raw, placeholderProvider: this.name } };
  }
}

export class YoudaoTtsProvider implements TtsProvider {
  name = "youdao" as const;
  private fallback = new MockTtsProvider();

  async synthesize(input: Parameters<TtsProvider["synthesize"]>[0]) {
    const result = await this.fallback.synthesize(input);
    return { ...result, provider: this.name, raw: { ...result.raw, placeholderProvider: this.name } };
  }
}
