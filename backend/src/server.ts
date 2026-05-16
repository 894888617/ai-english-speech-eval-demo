import cors from "cors";
import express from "express";
import fs from "node:fs/promises";
import multer from "multer";
import path from "node:path";
import { nanoid } from "nanoid";
import { config, resolveAppPath } from "./config.js";
import { demoSentences } from "./demoSentences.js";
import { evaluationProvider, runtimeMode, ttsProvider } from "./providers/index.js";
import { appendEvaluationLog, readEvaluationLogs } from "./services/logStore.js";

const uploadRoot = resolveAppPath(config.uploadDir);
const staticRoot = resolveAppPath(config.staticDir);
await fs.mkdir(uploadRoot, { recursive: true });
await fs.mkdir(staticRoot, { recursive: true });

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

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    mode: runtimeMode(),
    providers: {
      tts: ttsProvider.name,
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

    const uploadMs = Date.now() - requestStartedAt;
    const result = await evaluationProvider.evaluate({
      text,
      audioPath: req.file.path,
      audioMimeType: req.file.mimetype || "application/octet-stream"
    });
    const totalMs = Date.now() - requestStartedAt + result.timing.evaluationMs;
    const response = {
      ...result,
      provider: evaluationProvider.name,
      timing: {
        uploadMs,
        evaluationMs: result.timing.evaluationMs,
        totalMs
      }
    };

    await appendEvaluationLog({
      id: nanoid(10),
      text,
      source,
      provider: evaluationProvider.name,
      scores: response.scores,
      asrText: response.asrText,
      createdAt: new Date().toISOString(),
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
