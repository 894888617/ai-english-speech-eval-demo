import fs from "node:fs/promises";
import path from "node:path";
import { EvaluationLog } from "../types.js";

const dataDir = path.resolve(process.cwd(), "data");
const logPath = path.join(dataDir, "evaluation-logs.json");

async function ensureFile() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(logPath);
  } catch {
    await fs.writeFile(logPath, "[]", "utf-8");
  }
}

export async function appendEvaluationLog(log: EvaluationLog) {
  await ensureFile();
  const logs = await readEvaluationLogs(1000);
  logs.unshift(log);
  await fs.writeFile(logPath, JSON.stringify(logs.slice(0, 200), null, 2), "utf-8");
}

export async function readEvaluationLogs(limit = 20): Promise<EvaluationLog[]> {
  await ensureFile();
  const raw = await fs.readFile(logPath, "utf-8");
  try {
    const logs = JSON.parse(raw) as EvaluationLog[];
    return Array.isArray(logs) ? logs.slice(0, limit) : [];
  } catch {
    return [];
  }
}
