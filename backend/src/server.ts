import cors from "cors";
import express from "express";
import fs from "node:fs/promises";
import multer from "multer";
import path from "node:path";
import { nanoid } from "nanoid";
import { config, resolveAppPath } from "./config.js";
import { buildChineseFeedback } from "./feedback/feedbackBuilder.js";
import { demoSentences } from "./demoSentences.js";
import { createEvaluationProvider, evaluationProvider, runtimeMode, ttsProvider } from "./providers/index.js";
import { createFeedbackTtsProvider } from "./providers/tts/ttsProviderFactory.js";
import { runtimeConfigRoutes } from "./runtime-config/runtimeConfigRoutes.js";
import { runtimeEvaluationConfigStore } from "./runtime-config/RuntimeEvaluationConfigStore.js";
import { appendEvaluationLog, readEvaluationLogs } from "./services/logStore.js";

const uploadRoot = resolveAppPath(config.uploadDir);
const staticRoot = resolveAppPath(config.staticDir);
await fs.mkdir(uploadRoot, { recursive: true });
await fs.mkdir(staticRoot, { recursive: true });
await fs.mkdir(path.join(staticRoot, "feedback"), { recursive: true });
await fs.mkdir(path.join(staticRoot, "mock"), { recursive: true });

const upload = multer({
  dest: uploadRoot,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["audio/wav", "audio/wave", "audio/mpeg", "audio/mp3", "audio/webm", "audio/mp4", "audio/x-m4a", "audio/m4a"];
    if (allowed.includes(file.mimetype) || /\.(wav|mp3|webm|m4a)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error("仅支持 wav、mp3、webm、m4a 音频文件"));
  }
});

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use("/static", express.static(staticRoot));
app.use("/api/runtime-config", runtimeConfigRoutes);

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    mode: runtimeMode(),
    providers: {
      tts: ttsProvider.name,
      feedbackTts: config.feedback.ttsProvider,
      evaluation: evaluationProvider.name
    }
  });
});

app.get("/api/demo/sentences", (_req, res) => {
  res.json(demoSentences);
});

app.post("/api/tts", async (req, res, next) => {
  try {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    const speed = req.body?.speed === "slow" ? "slow" : "normal";
    const voice = req.body?.voice === "male" ? "male" : "female";
    if (!text) return res.status(400).json({ message: "text 不能为空" });
    const result = await ttsProvider.synthesize({ text, speed, voice });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/evaluate", upload.single("audio"), async (req, res, next) => {
  const requestStartedAt = Date.now();
  try {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    const source = req.body?.source === "upload" ? "upload" : "browser";
    if (!text) return res.status(400).json({ message: "text 不能为空" });
    if (!req.file) return res.status(400).json({ message: "audio 文件不能为空" });

    const configId = typeof req.body?.configId === "string" ? req.body.configId.trim() : "";
    const runtimeConfig = configId ? runtimeEvaluationConfigStore.get(configId) : undefined;
    const activeEvaluationProvider = createEvaluationProvider({ runtimeConfig });

    const uploadMs = Date.now() - requestStartedAt;
    const result = await activeEvaluationProvider.evaluate({
      text,
      audioPath: req.file.path,
      audioMimeType: req.file.mimetype || "application/octet-stream"
    });
    const feedbackBase = buildChineseFeedback({
      scores: result.scores,
      wordScores: result.wordScores,
      suggestions: result.suggestions,
      targetText: text
    });

    const runtimeFeedbackConfig = runtimeConfig?.feedback;
    const feedbackEnabled = runtimeFeedbackConfig?.enabled ?? config.feedback.enabled;
    const requestedFeedbackProvider = runtimeFeedbackConfig?.provider || config.feedback.ttsProvider;
    let feedbackAudio: { audioUrl: string; durationMs: number; provider: "mock" | "xfyun"; errorMessage?: string } | undefined;
    let feedbackTtsMs = 0;

    if (feedbackEnabled) {
      const feedbackTtsStartedAt = Date.now();
      try {
        const activeFeedbackTtsProvider = createFeedbackTtsProvider({ runtimeConfig: runtimeFeedbackConfig });
        const ttsResult = await activeFeedbackTtsProvider.synthesize({
          text: feedbackBase.text,
          language: feedbackBase.language,
          speed: runtimeFeedbackConfig?.speed || config.feedback.speed,
          voice: runtimeFeedbackConfig?.voice || config.feedback.voice
        });
        feedbackTtsMs = Date.now() - feedbackTtsStartedAt;
        feedbackAudio = { audioUrl: ttsResult.audioUrl, durationMs: ttsResult.durationMs, provider: ttsResult.provider };
      } catch (error) {
        feedbackTtsMs = Date.now() - feedbackTtsStartedAt;
        feedbackAudio = {
          audioUrl: "",
          durationMs: 0,
          provider: requestedFeedbackProvider,
          errorMessage: error instanceof Error ? error.message : "TTS generation failed"
        };
      }
    } else {
      feedbackAudio = { audioUrl: "", durationMs: 0, provider: requestedFeedbackProvider, errorMessage: "" };
    }
    const totalMs = Date.now() - requestStartedAt;
    const rawRecord = result.raw && typeof result.raw === "object" ? (result.raw as Record<string, unknown>) : {};
    const conversion = rawRecord.conversion && typeof rawRecord.conversion === "object" ? rawRecord.conversion as Record<string, unknown> : {};
    const response = {
      ...result,
      provider: activeEvaluationProvider.name,
      originalAudioMimeType: req.file.mimetype || "application/octet-stream",
      convertedAudioFormat: typeof conversion.convertedAudioFormat === "string" ? conversion.convertedAudioFormat : undefined,
      convertedAudioPath: typeof conversion.convertedAudioPath === "string" ? path.relative(process.cwd(), conversion.convertedAudioPath) : undefined,
      xfyunSid: typeof rawRecord.sid === "string" ? rawRecord.sid : undefined,
      xfyunCode: typeof rawRecord.code === "number" ? rawRecord.code : undefined,
      feedback: {
        text: feedbackBase.text,
        language: feedbackBase.language,
        audioUrl: feedbackAudio?.audioUrl || "",
        provider: feedbackAudio?.provider || requestedFeedbackProvider,
        durationMs: feedbackAudio?.durationMs || 0,
        ttsMs: feedbackTtsMs,
        errorMessage: feedbackAudio?.errorMessage || ""
      },
      timing: {
        uploadMs,
        evaluationMs: result.timing.evaluationMs,
        feedbackTtsMs,
        totalMs
      }
    };

    await appendEvaluationLog({
      id: nanoid(10),
      text,
      source,
      provider: activeEvaluationProvider.name,
      scores: response.scores,
      asrText: response.asrText,
      createdAt: new Date().toISOString(),
      originalAudioMimeType: response.originalAudioMimeType,
      convertedAudioFormat: response.convertedAudioFormat,
      convertedAudioPath: response.convertedAudioPath,
      xfyunSid: response.xfyunSid,
      xfyunCode: response.xfyunCode,
      errorMessage: response.status === "failed" ? response.message || response.suggestions?.[0] : undefined,
      feedbackText: response.feedback.text,
      feedbackLanguage: response.feedback.language,
      feedbackAudioUrl: response.feedback.audioUrl,
      feedbackTtsProvider: response.feedback.provider,
      feedbackTtsMs: response.feedback.ttsMs,
      feedbackTtsError: response.feedback.errorMessage,
      timing: response.timing
    });

    res.json(response);
  } catch (error) {
    next(error);
  }
});

app.get("/api/evaluation/logs", async (_req, res, next) => {
  try {
    res.json(await readEvaluationLogs(20));
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "服务器内部错误";
  res.status(500).json({ message });
});

app.listen(config.port, () => {
  console.log(`AI English speech eval demo backend listening on http://localhost:${config.port}`);
  console.log(`Mode: ${runtimeMode()}, TTS: ${ttsProvider.name}, evaluation: ${evaluationProvider.name}`);
  console.log(`Static root: ${path.relative(process.cwd(), staticRoot) || "."}`);
});
