import { RuntimeEvaluationConfig } from "./RuntimeEvaluationConfigStore.js";

function maskValue(value: string) {
  if (!value) return "";
  if (value.length <= 6) return `${value.slice(0, 1)}****${value.slice(-1)}`;
  return `${value.slice(0, 3)}****${value.slice(-3)}`;
}

export function maskRuntimeEvaluationConfig(config: RuntimeEvaluationConfig) {
  return {
    id: config.id,
    provider: config.provider,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
    xfyun: config.xfyun ? {
      appId: maskValue(config.xfyun.appId),
      apiKey: maskValue(config.xfyun.apiKey),
      apiSecret: config.xfyun.apiSecret ? "configured" : "missing",
      endpoint: config.xfyun.endpoint,
      language: config.xfyun.language,
      category: config.xfyun.category
    } : undefined,
    feedback: config.feedback ? {
      enabled: config.feedback.enabled,
      provider: config.feedback.provider,
      voice: config.feedback.voice,
      speed: config.feedback.speed,
      xfyun: config.feedback.xfyun ? {
        appId: maskValue(config.feedback.xfyun.appId),
        apiKey: maskValue(config.feedback.xfyun.apiKey),
        apiSecret: config.feedback.xfyun.apiSecret ? "configured" : "missing",
        endpoint: config.feedback.xfyun.endpoint
      } : undefined
    } : undefined
  };
}
