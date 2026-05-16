import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { resolveAppPath } from "../config.js";

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);

export interface ConvertedAudioInfo {
  originalAudioMimeType: string;
  originalAudioPath: string;
  convertedAudioPath: string;
  convertedAudioFormat: string;
  sampleRate: number;
  channels: number;
  bitDepth: number;
}

export async function convertToXfyunPcm(input: { audioPath: string; audioMimeType: string; uploadDir: string; sampleRate?: number }) {
  const sampleRate = input.sampleRate || 16000;
  const convertedDir = path.join(resolveAppPath(input.uploadDir), "converted");
  await fs.mkdir(convertedDir, { recursive: true });
  const convertedAudioPath = path.join(convertedDir, `${Date.now()}-${nanoid(8)}.pcm`);

  await new Promise<void>((resolve, reject) => {
    ffmpeg(input.audioPath)
      .noVideo()
      .audioFrequency(sampleRate)
      .audioChannels(1)
      .audioCodec("pcm_s16le")
      .format("s16le")
      .on("error", (error) => reject(new Error(`Audio conversion failed: ${error.message}`)))
      .on("end", () => resolve())
      .save(convertedAudioPath);
  });

  pruneConvertedFiles(convertedDir, 30).catch(() => undefined);
  return {
    originalAudioMimeType: input.audioMimeType,
    originalAudioPath: input.audioPath,
    convertedAudioPath,
    convertedAudioFormat: `pcm_s16le;rate=${sampleRate};channels=1`,
    sampleRate,
    channels: 1,
    bitDepth: 16
  } satisfies ConvertedAudioInfo;
}

async function pruneConvertedFiles(dir: string, keep: number) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => {
    const fullPath = path.join(dir, entry.name);
    const stat = await fs.stat(fullPath);
    return { fullPath, mtimeMs: stat.mtimeMs };
  }));
  await Promise.all(files.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(keep).map((file) => fs.unlink(file.fullPath).catch(() => undefined)));
}
