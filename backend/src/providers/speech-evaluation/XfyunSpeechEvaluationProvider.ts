import fs from "node:fs/promises";
import WebSocket from "ws";
import { convertToXfyunPcm } from "../../audio/audioConverter.js";
import { config } from "../../config.js";
import { RuntimeEvaluationConfig } from "../../runtime-config/RuntimeEvaluationConfigStore.js";
import { ScoreSet, SpeechEvaluationProvider, WordScore } from "../../types.js";
import { createXfyunAuthUrl } from "./xfyunAuth.js";
import { parseXfyunResult, XfyunRawMessage } from "./xfyunResultParser.js";

const emptyScores: ScoreSet = { total: 0, accuracy: 0, fluency: 0, integrity: 0, clarity: 0 };

function failedResult(input: { message: string; errorCode: string; evaluationMs: number; totalMs?: number; raw?: unknown }) {
  return {
    status: "failed" as const,
    scores: emptyScores,
    asrText: "",
    wordScores: [] as WordScore[],
    suggestions: [input.message],
    message: input.message,
    errorCode: input.errorCode,
    timing: { evaluationMs: input.evaluationMs, totalMs: input.totalMs ?? input.evaluationMs },
    raw: input.raw
  };
}

type XfyunEvaluationOptions = {
  appId?: string;
  apiKey?: string;
  apiSecret?: string;
  endpoint?: string;
  language?: string;
  category?: "read_word" | "read_sentence" | "read_chapter" | string;
};

function resolveXfyunOptions(runtimeConfig?: RuntimeEvaluationConfig): Required<Pick<XfyunEvaluationOptions, "appId" | "apiKey" | "apiSecret" | "endpoint" | "language" | "category">> {
  return {
    appId: runtimeConfig?.xfyun?.appId || config.credentials.xfyun.appId,
    apiKey: runtimeConfig?.xfyun?.apiKey || config.credentials.xfyun.apiKey,
    apiSecret: runtimeConfig?.xfyun?.apiSecret || config.credentials.xfyun.apiSecret,
    endpoint: runtimeConfig?.xfyun?.endpoint || config.xfyun.iseEndpoint,
    language: runtimeConfig?.xfyun?.language || config.xfyun.language,
    category: runtimeConfig?.xfyun?.category || config.xfyun.category
  };
}

function credentialsConfigured(options: XfyunEvaluationOptions) {
  return Boolean(options.appId && options.apiKey && options.apiSecret);
}

function xfyunText(text: string, language: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return language === "en" || language === "en_us" ? `[content]${normalized}` : `\uFEFF${normalized}`;
}

export class XfyunSpeechEvaluationProvider implements SpeechEvaluationProvider {
  name = "xfyun" as const;
  private readonly options: ReturnType<typeof resolveXfyunOptions>;

  constructor(options?: { runtimeConfig?: RuntimeEvaluationConfig }) {
    this.options = resolveXfyunOptions(options?.runtimeConfig);
  }

  async evaluate(input: { text: string; audioPath: string; audioMimeType: string }) {
    const startedAt = Date.now();
    if (!credentialsConfigured(this.options)) {
      return failedResult({ message: "XFYUN credentials are not configured", errorCode: "XFYUN_CREDENTIALS_MISSING", evaluationMs: Date.now() - startedAt });
    }

    let conversion: Awaited<ReturnType<typeof convertToXfyunPcm>> | undefined;
    try {
      conversion = await convertToXfyunPcm({ audioPath: input.audioPath, audioMimeType: input.audioMimeType, uploadDir: config.uploadDir, sampleRate: config.xfyun.audioRate });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Audio conversion failed";
      return failedResult({ message, errorCode: "AUDIO_CONVERSION_FAILED", evaluationMs: Date.now() - startedAt, raw: { originalAudioMimeType: input.audioMimeType } });
    }

    try {
      const authUrl = createXfyunAuthUrl(this.options.endpoint, this.options.apiKey, this.options.apiSecret);
      const messages = await this.callWebSocket(authUrl, input.text, conversion.convertedAudioPath);
      const evaluationMs = Date.now() - startedAt;
      return await parseXfyunResult({ messages, text: input.text, evaluationMs, totalMs: evaluationMs, conversion });
    } catch (error) {
      const evaluationMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : "Xfyun evaluation failed";
      const errorRecord = error && typeof error === "object" ? error as Record<string, unknown> : {};
      const errorCode = /timeout/i.test(message) ? "XFYUN_TIMEOUT" : /code/i.test(message) ? "XFYUN_API_ERROR" : "XFYUN_EVALUATION_FAILED";
      return failedResult({ message, errorCode, evaluationMs, raw: { conversion, sid: errorRecord.xfyunSid, code: errorRecord.xfyunCode, errorMessage: message, xfyunRawMessage: errorRecord.xfyunRawMessage } });
    }
  }

  private async callWebSocket(authUrl: string, text: string, audioPath: string) {
    const audio = await fs.readFile(audioPath);
    const messages: XfyunRawMessage[] = [];
    const frameSize = 1280;
    const intervalMs = 40;

    return await new Promise<XfyunRawMessage[]>((resolve, reject) => {
      let settled = false;
      let sendTimer: NodeJS.Timeout | undefined;
      const timeout = setTimeout(() => finish(new Error("Xfyun WebSocket timeout")), config.xfyun.timeoutMs);
      const ws = new WebSocket(authUrl);

      function finish(error?: Error) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (sendTimer) clearInterval(sendTimer);
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close(1000);
        error ? reject(error) : resolve(messages);
      }

      ws.on("open", () => {
        ws.send(JSON.stringify({
          common: { app_id: this.options.appId },
          business: {
            sub: "ise",
            ent: this.options.language === "en" || this.options.language === "en_us" ? "en_vip" : "cn_vip",
            category: this.options.category,
            cmd: "ssb",
            text: xfyunText(text, this.options.language),
            tte: "utf-8",
            ttp_skip: true,
            aue: "raw",
            auf: `audio/L16;rate=${config.xfyun.audioRate}`,
            rstcd: "utf8",
            rst: "entirety",
            ise_unite: "1",
            extra_ability: "multi_dimension"
          },
          data: { status: 0 }
        }));

        let offset = 0;
        let frameIndex = 0;
        sendTimer = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) return;
          if (offset >= audio.length) {
            ws.send(JSON.stringify({ business: { cmd: "auw", aus: 4 }, data: { status: 2, data: "" } }));
            if (sendTimer) clearInterval(sendTimer);
            return;
          }
          const chunk = audio.subarray(offset, Math.min(offset + frameSize, audio.length));
          offset += chunk.length;
          ws.send(JSON.stringify({
            business: { cmd: "auw", aus: frameIndex === 0 ? 1 : 2 },
            data: { status: 1, data: chunk.toString("base64") }
          }));
          frameIndex += 1;
        }, intervalMs);
      });

      ws.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString()) as XfyunRawMessage;
          messages.push(message);
          if (message.code && message.code !== 0) finish(Object.assign(new Error(`Xfyun returned code ${message.code}: ${message.message || "unknown error"}`), { xfyunCode: message.code, xfyunSid: message.sid, xfyunRawMessage: message }));
          if (message.data?.status === 2) finish();
        } catch (error) {
          finish(error instanceof Error ? error : new Error("Failed to parse Xfyun WebSocket message"));
        }
      });
      ws.on("error", (error) => finish(new Error(`Xfyun WebSocket error: ${error.message}`)));
      ws.on("close", () => {
        if (!settled && messages.some((item) => item.data?.status === 2)) finish();
        else if (!settled) finish(new Error("Xfyun WebSocket closed before final result"));
      });
    });
  }
}
