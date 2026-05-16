import fs from "node:fs/promises";
import path from "node:path";
import WebSocket from "ws";
import { config, resolveAppPath } from "../../config.js";
import { createXfyunAuthUrl } from "../speech-evaluation/xfyunAuth.js";
import { TtsProvider } from "./TtsProvider.js";

type XfyunTtsOptions = {
    appId?: string;
    apiKey?: string;
    apiSecret?: string;
    endpoint?: string;
};

type XfyunTtsMessage = {
    code?: number;
    message?: string;
    sid?: string;
    data?: {
        audio?: string;
        status?: number;
        ced?: string;
    };
};

function credentialsConfigured(options: Required<XfyunTtsOptions>) {
    return Boolean(options.appId && options.apiKey && options.apiSecret);
}

function xfyunSpeed(speed: "normal" | "slow" | undefined) {
    return speed === "slow" ? 35 : 50;
}

export class XfyunTtsProvider implements TtsProvider {
    readonly name = "xfyun" as const;
    private readonly options: Required<XfyunTtsOptions>;

    constructor(options?: XfyunTtsOptions) {
        this.options = {
            appId: options?.appId || config.feedback.xfyun.appId || config.credentials.xfyun.appId,
            apiKey: options?.apiKey || config.feedback.xfyun.apiKey || config.credentials.xfyun.apiKey,
            apiSecret: options?.apiSecret || config.feedback.xfyun.apiSecret || config.credentials.xfyun.apiSecret,
            endpoint: options?.endpoint || config.feedback.xfyun.endpoint
        };
    }

    async synthesize(input: { text: string; language: "zh"; speed?: "normal" | "slow"; voice?: string }) {
        if (input.language !== "zh") throw new Error("Xfyun feedback TTS only supports zh in this demo");
        if (!credentialsConfigured(this.options)) throw new Error("XFYUN TTS credentials are not configured");
        if (!input.text.trim()) throw new Error("TTS text is empty");

        const startedAt = Date.now();
        const authUrl = createXfyunAuthUrl(this.options.endpoint, this.options.apiKey, this.options.apiSecret);
        const audio = await this.callWebSocket(authUrl, input);
        const feedbackDir = path.join(resolveAppPath(config.staticDir), "feedback");
        await fs.mkdir(feedbackDir, { recursive: true });
        const fileName = `feedback_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`;
        await fs.writeFile(path.join(feedbackDir, fileName), audio);

        return {
            audioUrl: `/static/feedback/${fileName}`,
            durationMs: Math.max(1000, Math.round(input.text.length * (input.speed === "slow" ? 260 : 190))),
            provider: this.name,
            raw: { ttsMs: Date.now() - startedAt }
        };
    }

    private async callWebSocket(authUrl: string, input: { text: string; speed?: "normal" | "slow"; voice?: string }) {
        const chunks: Buffer[] = [];
        const text = Buffer.from(input.text.trim(), "utf8").toString("base64");

        return await new Promise<Buffer>((resolve, reject) => {
            let settled = false;
            const ws = new WebSocket(authUrl);
            const timeout = setTimeout(() => finish(new Error("Xfyun TTS WebSocket timeout")), config.feedback.xfyun.timeoutMs);

            function finish(error?: Error) {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close(1000);
                if (error) reject(error);
                else if (chunks.length === 0) reject(new Error("Xfyun TTS returned empty audio"));
                else resolve(Buffer.concat(chunks));
            }

            ws.on("open", () => {
                ws.send(JSON.stringify({
                    common: { app_id: this.options.appId },
                    business: {
                        aue: "lame",
                        auf: "audio/L16;rate=16000",
                        vcn: input.voice || config.feedback.voice || "xiaoyan",
                        speed: xfyunSpeed(input.speed),
                        volume: 50,
                        pitch: 50,
                        bgs: 0,
                        tte: "UTF8"
                    },
                    data: {
                        status: 2,
                        text
                    }
                }));
            });

            ws.on("message", (data: WebSocket.RawData) => {
                try {
                    const message = JSON.parse(data.toString()) as XfyunTtsMessage;
                    if (message.code && message.code !== 0) {
                        finish(Object.assign(new Error(`Xfyun TTS returned code ${message.code}: ${message.message || "unknown error"}`), {
                            xfyunCode: message.code,
                            xfyunSid: message.sid
                        }));
                        return;
                    }
                    if (message.data?.audio) chunks.push(Buffer.from(message.data.audio, "base64"));
                    if (message.data?.status === 2) finish();
                } catch (error) {
                    finish(error instanceof Error ? error : new Error("Failed to parse Xfyun TTS message"));
                }
            });

            ws.on("error", (error: Error) => finish(new Error(`Xfyun TTS WebSocket error: ${error.message}`)));
            ws.on("close", () => {
                if (!settled && chunks.length > 0) finish();
                else if (!settled) finish(new Error("Xfyun TTS WebSocket closed before final audio"));
            });
        });
    }
}