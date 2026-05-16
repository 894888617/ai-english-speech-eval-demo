import { TtsProvider } from "../types.js";
import { MockTtsProvider } from "./mockTtsProvider.js";

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
