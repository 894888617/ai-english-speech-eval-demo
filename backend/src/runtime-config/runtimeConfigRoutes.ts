import { Router } from "express";
import { config } from "../config.js";
import { createXfyunAuthUrl } from "../providers/speech-evaluation/xfyunAuth.js";
import { RuntimeEvaluationConfigInput, RuntimeFeedbackConfig, RuntimeXfyunCategory, runtimeEvaluationConfigStore } from "./RuntimeEvaluationConfigStore.js";
import { maskRuntimeEvaluationConfig } from "./maskSecret.js";

const router = Router();
const validProviders = new Set(["mock", "xfyun"]);
const validCategories = new Set(["read_word", "read_sentence", "read_chapter"]);
const validFeedbackProviders = new Set(["mock", "xfyun"]);

function parseFeedbackConfig(record: Record<string, unknown>): RuntimeFeedbackConfig | undefined {
  const feedback = record.feedback && typeof record.feedback === "object" ? record.feedback as Record<string, unknown> : undefined;
  if (!feedback) return undefined;
  const provider = feedback.provider === "xfyun" ? "xfyun" : "mock";
  if (!validFeedbackProviders.has(provider)) throw new Error("feedback provider must be mock or xfyun");
  const parsed: RuntimeFeedbackConfig = {
    enabled: feedback.enabled !== false,
    provider,
    voice: typeof feedback.voice === "string" && feedback.voice.trim() ? feedback.voice.trim() : "xiaoyan",
    speed: feedback.speed === "slow" ? "slow" : "normal"
  };
  if (provider === "xfyun") {
    const xfyun = feedback.xfyun && typeof feedback.xfyun === "object" ? feedback.xfyun as Record<string, unknown> : undefined;
    const appId = typeof xfyun?.appId === "string" ? xfyun.appId.trim() : "";
    const apiKey = typeof xfyun?.apiKey === "string" ? xfyun.apiKey.trim() : "";
    const apiSecret = typeof xfyun?.apiSecret === "string" ? xfyun.apiSecret.trim() : "";
    const endpoint = typeof xfyun?.endpoint === "string" ? xfyun.endpoint.trim() : undefined;
    parsed.xfyun = { appId, apiKey, apiSecret, endpoint };
  }
  return parsed;
}

function parseRuntimeConfigInput(body: unknown): RuntimeEvaluationConfigInput {
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const provider = record.provider;
  if (provider !== "mock" && provider !== "xfyun") throw new Error("provider must be mock or xfyun");

  const feedback = parseFeedbackConfig(record);

  if (provider === "mock") return { provider, feedback };

  const xfyun = record.xfyun && typeof record.xfyun === "object" ? record.xfyun as Record<string, unknown> : undefined;
  if (!xfyun) throw new Error("xfyun config is required when provider=xfyun");

  const appId = typeof xfyun.appId === "string" ? xfyun.appId.trim() : "";
  const apiKey = typeof xfyun.apiKey === "string" ? xfyun.apiKey.trim() : "";
  const apiSecret = typeof xfyun.apiSecret === "string" ? xfyun.apiSecret.trim() : "";
  const endpoint = typeof xfyun.endpoint === "string" ? xfyun.endpoint.trim() : undefined;
  const language = typeof xfyun.language === "string" && xfyun.language.trim() ? xfyun.language.trim() : "en_us";
  const category: RuntimeXfyunCategory = typeof xfyun.category === "string" && validCategories.has(xfyun.category) ? xfyun.category as RuntimeXfyunCategory : "read_sentence";

  if (!appId || !apiKey || !apiSecret) throw new Error("appId, apiKey and apiSecret are required when provider=xfyun");

  return { provider, xfyun: { appId, apiKey, apiSecret, endpoint, language, category }, feedback };
}

function testConfig(input: RuntimeEvaluationConfigInput) {
  if (!validProviders.has(input.provider)) throw new Error("provider must be mock or xfyun");
  if (input.provider === "xfyun") {
    if (!input.xfyun?.appId || !input.xfyun.apiKey || !input.xfyun.apiSecret) throw new Error("appId, apiKey and apiSecret are required when provider=xfyun");
    createXfyunAuthUrl(input.xfyun.endpoint || config.xfyun.iseEndpoint, input.xfyun.apiKey, input.xfyun.apiSecret);
  }
  if (input.feedback?.provider === "xfyun" && input.feedback.xfyun?.apiKey && input.feedback.xfyun?.apiSecret) {
    createXfyunAuthUrl(input.feedback.xfyun.endpoint || config.feedback.xfyun.endpoint, input.feedback.xfyun.apiKey, input.feedback.xfyun.apiSecret);
  }
  if (input.provider === "xfyun" && input.feedback?.provider === "xfyun") return "XFYUN evaluation and feedback TTS config look valid";
  if (input.provider === "xfyun") return "XFYUN config looks valid";
  if (input.feedback?.provider === "xfyun") return "Mock evaluation and XFYUN feedback TTS config look valid";
  return "Mock config looks valid";
}

router.post("/evaluation", (req, res) => {
  try {
    const saved = runtimeEvaluationConfigStore.save(parseRuntimeConfigInput(req.body));
    res.json({ ok: true, configId: saved.id, provider: saved.provider });
  } catch (error) {
    res.status(400).json({ ok: false, message: error instanceof Error ? error.message : "Invalid runtime evaluation config" });
  }
});

router.get("/evaluation/:configId", (req, res) => {
  const saved = runtimeEvaluationConfigStore.get(req.params.configId);
  if (!saved) return res.status(404).json({ ok: false, message: "Runtime config not found" });
  res.json({ ok: true, config: maskRuntimeEvaluationConfig(saved) });
});

router.post("/evaluation/test", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    const configId = typeof body.configId === "string" ? body.configId.trim() : "";
    const input = configId ? runtimeEvaluationConfigStore.get(configId) : parseRuntimeConfigInput(body);
    if (!input) return res.status(404).json({ ok: false, message: "Runtime config not found" });
    res.json({ ok: true, message: testConfig(input) });
  } catch (error) {
    res.status(400).json({ ok: false, message: error instanceof Error ? error.message : "Runtime config test failed" });
  }
});

router.delete("/evaluation/:configId", (req, res) => {
  runtimeEvaluationConfigStore.delete(req.params.configId);
  res.json({ ok: true });
});

export const runtimeConfigRoutes = router;
