import fs from "node:fs/promises";
import path from "node:path";
import { config, resolveAppPath } from "../config.js";
import { TtsProvider } from "../types.js";

const silentMp3Base64 =
  "SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjQ1LjEwMAAAAAAAAAAAAAAA//tQxAADB4AhSmxhIIEVCSiJAAADSAAAAANIAAAARMQAAABAAABpAAAACAAADSAAAAANIAAAARMQAAABAAABpAAAACAAAAAA=";

export class MockTtsProvider implements TtsProvider {
  name = "mock" as const;

  async synthesize(input: { text: string; speed: "normal" | "slow"; voice: "female" | "male" }) {
    const startedAt = Date.now();
    const ttsDir = path.join(resolveAppPath(config.staticDir), "tts");
    await fs.mkdir(ttsDir, { recursive: true });
    const normalized = input.text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "demo";
    const fileName = `mock-${normalized}-${input.speed}-${input.voice}.mp3`;
    const filePath = path.join(ttsDir, fileName);

    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, Buffer.from(silentMp3Base64, "base64"));
    }

    const wordCount = Math.max(input.text.trim().split(/\s+/).filter(Boolean).length, 1);
    const durationMs = Math.round((input.speed === "slow" ? 850 : 620) * wordCount + (Date.now() - startedAt));
    return {
      audioUrl: `/static/tts/${fileName}`,
      durationMs,
      provider: this.name,
      raw: { note: "Mock TTS returns a tiny placeholder mp3. Browser speechSynthesis can be used as audible fallback." }
    };
  }
}
