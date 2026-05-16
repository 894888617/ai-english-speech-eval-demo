import fs from "node:fs/promises";
import path from "node:path";
import { config, resolveAppPath } from "../../config.js";
import { TtsProvider } from "./TtsProvider.js";

const silentMp3Base64 =
    "SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjQ1LjEwMAAAAAAAAAAAAAAA//tQxAADB4AhSmxhIIEVCSiJAAADSAAAAANIAAAARMQAAABAAABpAAAACAAADSAAAAANIAAAARMQAAABAAABpAAAACAAAAAA=";

export class MockTtsProvider implements TtsProvider {
    readonly name = "mock" as const;

    async synthesize() {
        const mockDir = path.join(resolveAppPath(config.staticDir), "mock");
        const fileName = "feedback-zh.mp3";
        const filePath = path.join(mockDir, fileName);

        try {
            await fs.mkdir(mockDir, { recursive: true });
            await fs.access(filePath).catch(() => fs.writeFile(filePath, Buffer.from(silentMp3Base64, "base64")));
            return {
                audioUrl: `/static/mock/${fileName}`,
                durationMs: 3000,
                provider: this.name,
                raw: { note: "Mock Chinese feedback TTS placeholder audio." }
            };
        } catch {
            return {
                audioUrl: "",
                durationMs: 0,
                provider: this.name,
                raw: { note: "Mock Chinese feedback TTS could not create placeholder audio, text feedback remains available." }
            };
        }
    }
}