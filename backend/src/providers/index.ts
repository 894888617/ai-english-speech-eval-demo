import { config } from "../config.js";
import { RuntimeEvaluationConfig } from "../runtime-config/RuntimeEvaluationConfigStore.js";
import { ProviderName, SpeechEvaluationProvider, TtsProvider } from "../types.js";
import { MockSpeechEvaluationProvider } from "./speech-evaluation/MockSpeechEvaluationProvider.js";
import { XfyunSpeechEvaluationProvider } from "./speech-evaluation/XfyunSpeechEvaluationProvider.js";
import { MockTtsProvider } from "./mockTtsProvider.js";
import { TencentTtsProvider, YoudaoTtsProvider } from "./placeholderProviders.js";

function hasTtsCredentials(provider: ProviderName) {
  if (provider === "tencent") return Boolean(config.credentials.tencent.secretId && config.credentials.tencent.secretKey);
  if (provider === "youdao") return Boolean(config.credentials.youdao.appKey && config.credentials.youdao.appSecret);
  return false;
}

export function createTtsProvider(): TtsProvider {
  if (config.ttsProvider === "tencent" && hasTtsCredentials("tencent")) return new TencentTtsProvider();
  if (config.ttsProvider === "youdao" && hasTtsCredentials("youdao")) return new YoudaoTtsProvider();
  return new MockTtsProvider();
}

export function createEvaluationProvider(options?: { runtimeConfig?: RuntimeEvaluationConfig }): SpeechEvaluationProvider {
  if (options?.runtimeConfig?.provider === "mock") return new MockSpeechEvaluationProvider();
  if (options?.runtimeConfig?.provider === "xfyun") return new XfyunSpeechEvaluationProvider({ runtimeConfig: options.runtimeConfig });
  if (config.evaluationProvider === "xfyun") return new XfyunSpeechEvaluationProvider();
  return new MockSpeechEvaluationProvider();
}

export const ttsProvider = createTtsProvider();
export const evaluationProvider = createEvaluationProvider();

export function runtimeMode() {
  return ttsProvider.name === "mock" && evaluationProvider.name === "mock" ? "mock" : "real";
}
