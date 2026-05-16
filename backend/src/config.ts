import dotenv from "dotenv";
import path from "node:path";

// Load .env from backend cwd first, and root .env as a fallback for local demos.
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "..", ".env"), override: false });

const providerValues = ["mock", "xfyun", "tencent", "youdao"] as const;
type ProviderValue = (typeof providerValues)[number];

function normalizeProvider(value: string | undefined): ProviderValue {
  return providerValues.includes(value as ProviderValue) ? (value as ProviderValue) : "mock";
}

export const config = {
  port: Number(process.env.PORT || 3001),
  nodeEnv: process.env.NODE_ENV || "development",
  ttsProvider: normalizeProvider(process.env.TTS_PROVIDER),
  evaluationProvider: normalizeProvider(process.env.EVALUATION_PROVIDER),
  uploadDir: process.env.UPLOAD_DIR || "./uploads",
  staticDir: process.env.STATIC_DIR || "./static",
  credentials: {
    xfyun: {
      appId: process.env.XFYUN_APP_ID || "",
      apiKey: process.env.XFYUN_API_KEY || "",
      apiSecret: process.env.XFYUN_API_SECRET || ""
    },
    tencent: {
      secretId: process.env.TENCENT_SECRET_ID || "",
      secretKey: process.env.TENCENT_SECRET_KEY || "",
      region: process.env.TENCENT_REGION || ""
    },
    youdao: {
      appKey: process.env.YOUDAO_APP_KEY || "",
      appSecret: process.env.YOUDAO_APP_SECRET || ""
    }
  }
};

export function resolveAppPath(relativeOrAbsolute: string) {
  return path.isAbsolute(relativeOrAbsolute)
    ? relativeOrAbsolute
    : path.resolve(process.cwd(), relativeOrAbsolute);
}
