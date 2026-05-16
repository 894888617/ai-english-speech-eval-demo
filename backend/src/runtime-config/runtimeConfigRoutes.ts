import { Router } from "express";
import { config } from "../config.js";
import { createXfyunAuthUrl } from "../providers/speech-evaluation/xfyunAuth.js";
import { RuntimeEvaluationConfigInput, RuntimeXfyunCategory, runtimeEvaluationConfigStore } from "./RuntimeEvaluationConfigStore.js";
import { maskRuntimeEvaluationConfig } from "./maskSecret.js";

const router = Router();
const validProviders = new Set(["mock", "xfyun"]);
const validCategories = new Set(["read_word", "read_sentence", "read_chapter"]);

function parseRuntimeConfigInput(body: unknown): RuntimeEvaluationConfigInput {
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const provider = record.provider;
  if (provider !== "mock" && provider !== "xfyun") throw new Error("provider must be mock or xfyun");

  if (provider === "mock") return { provider };

  const xfyun = record.xfyun && typeof record.xfyun === "object" ? record.xfyun as Record<string, unknown> : undefined;
  if (!xfyun) throw new Error("xfyun config is required when provider=xfyun");

  const appId = typeof xfyun.appId === "string" ? xfyun.appId.trim() : "";
  const apiKey = typeof xfyun.apiKey === "string" ? xfyun.apiKey.trim() : "";
  const apiSecret = typeof xfyun.apiSecret === "string" ? xfyun.apiSecret.trim() : "";
  const endpoint = typeof xfyun.endpoint === "string" ? xfyun.endpoint.trim() : undefined;
  const language = typeof xfyun.language === "string" && xfyun.language.trim() ? xfyun.language.trim() : "en_us";
  const category: RuntimeXfyunCategory = typeof xfyun.category === "string" && validCategories.has(xfyun.category) ? xfyun.category as RuntimeXfyunCategory : "read_sentence";

  if (!appId || !apiKey || !apiSecret) throw new Error("appId, apiKey and apiSecret are required when provider=xfyun");

  return { provider, xfyun: { appId, apiKey, apiSecret, endpoint, language, category } };
}

function testConfig(input: RuntimeEvaluationConfigInput) {
  if (!validProviders.has(input.provider)) throw new Error("provider must be mock or xfyun");
  if (input.provider === "mock") return "Mock config looks valid";
  if (!input.xfyun?.appId || !input.xfyun.apiKey || !input.xfyun.apiSecret) throw new Error("appId, apiKey and apiSecret are required when provider=xfyun");
  createXfyunAuthUrl(input.xfyun.endpoint || config.xfyun.iseEndpoint, input.xfyun.apiKey, input.xfyun.apiSecret);
  return "XFYUN config looks valid";
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
