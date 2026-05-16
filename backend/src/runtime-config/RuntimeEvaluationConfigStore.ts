import { nanoid } from "nanoid";

export type RuntimeEvaluationProvider = "mock" | "xfyun";
export type RuntimeXfyunCategory = "read_word" | "read_sentence" | "read_chapter";

export type RuntimeEvaluationConfig = {
  id: string;
  provider: RuntimeEvaluationProvider;
  xfyun?: {
    appId: string;
    apiKey: string;
    apiSecret: string;
    endpoint?: string;
    language?: string;
    category?: RuntimeXfyunCategory;
  };
  createdAt: string;
  updatedAt: string;
};

export type RuntimeEvaluationConfigInput = {
  provider: RuntimeEvaluationProvider;
  xfyun?: RuntimeEvaluationConfig["xfyun"];
};

const configs = new Map<string, RuntimeEvaluationConfig>();

function cleanOptional(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeCategory(value: unknown): RuntimeXfyunCategory | undefined {
  const normalized = cleanOptional(value);
  if (normalized === "read_word" || normalized === "read_sentence" || normalized === "read_chapter") return normalized;
  return undefined;
}

export class RuntimeEvaluationConfigStore {
  save(input: RuntimeEvaluationConfigInput) {
    const now = new Date().toISOString();
    const id = `cfg_${nanoid(12)}`;
    const config: RuntimeEvaluationConfig = {
      id,
      provider: input.provider,
      createdAt: now,
      updatedAt: now
    };

    if (input.provider === "xfyun" && input.xfyun) {
      config.xfyun = {
        appId: input.xfyun.appId.trim(),
        apiKey: input.xfyun.apiKey.trim(),
        apiSecret: input.xfyun.apiSecret.trim(),
        endpoint: cleanOptional(input.xfyun.endpoint),
        language: cleanOptional(input.xfyun.language) || "en_us",
        category: normalizeCategory(input.xfyun.category) || "read_sentence"
      };
    }

    configs.set(id, config);
    return config;
  }

  get(configId: string) {
    return configs.get(configId);
  }

  delete(configId: string) {
    configs.delete(configId);
  }
}

export const runtimeEvaluationConfigStore = new RuntimeEvaluationConfigStore();
