import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Status = "待录音" | "录音中" | "待提交" | "评测中" | "评测完成" | "评测失败";
type AudioSource = "浏览器录音" | "本地上传" | "未选择";

interface DemoSentence { id: string; text: string; level: string; }
interface ScoreSet { total: number; accuracy: number; fluency: number; integrity: number; clarity: number; }
interface WordScore { word: string; score: number; status: "ok" | "warning" | "bad"; suggestion?: string; }
interface EvaluationResult {
  status: "complete" | "failed";
  provider: string;
  scores: ScoreSet;
  asrText: string;
  wordScores: WordScore[];
  suggestions: string[];
  timing: { uploadMs: number; evaluationMs: number; totalMs: number; };
}

const defaultText = `Hello.\nI see a little cat.\nThe rabbit is running fast.\nCan you see the yellow bird?`;

function scoreClass(score: number) {
  if (score < 70) return "bad";
  if (score <= 85) return "warning";
  return "ok";
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="score-row">
      <div className="score-row__meta"><span>{label}</span><strong>{value.toFixed(1)}</strong></div>
      <div className="bar"><span className={scoreClass(value)} style={{ width: `${Math.min(value, 100)}%` }} /></div>
    </div>
  );
}

function App() {
  const [sentences, setSentences] = useState<DemoSentence[]>([]);
  const [text, setText] = useState(defaultText);
  const [selectedId, setSelectedId] = useState("");
  const [status, setStatus] = useState<Status>("待录音");
  const [audioSource, setAudioSource] = useState<AudioSource>("未选择");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [standardAudioUrl, setStandardAudioUrl] = useState("");
  const [ttsMs, setTtsMs] = useState<number | null>(null);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [message, setMessage] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const activeText = useMemo(() => text.trim(), [text]);

  useEffect(() => {
    fetch("/api/demo/sentences")
      .then((res) => res.json())
      .then((data: DemoSentence[]) => {
        setSentences(data);
        if (data[0]) setSelectedId(data[0].id);
      })
      .catch(() => setMessage("无法加载内置句子，请确认后端已启动。"));
  }, []);

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  function chooseSentence(id: string) {
    setSelectedId(id);
    const sentence = sentences.find((item) => item.id === id);
    if (sentence) setText(sentence.text);
  }

  async function playStandardVoice() {
    if (!activeText) return setMessage("请先输入英文测试句子。");
    setMessage("正在生成标准读音...");
    const startedAt = performance.now();
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: activeText, speed: "normal", voice: "female" })
      });
      if (!response.ok) throw new Error("TTS 接口调用失败");
      const data = await response.json() as { audioUrl: string; durationMs: number; provider: string };
      setTtsMs(Math.round(performance.now() - startedAt));
      setStandardAudioUrl(data.audioUrl);
      if ("speechSynthesis" in window) {
        const utterance = new SpeechSynthesisUtterance(activeText);
        utterance.lang = "en-US";
        utterance.rate = 0.9;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      }
      setMessage(`标准读音已准备（provider: ${data.provider}）。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "标准读音生成失败");
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) return setMessage("当前浏览器不支持录音，请改用本地音频上传。");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioBlob(blob);
      setAudioUrl(URL.createObjectURL(blob));
      setAudioSource("浏览器录音");
      setStatus("待提交");
      stream.getTracks().forEach((track) => track.stop());
    };
    recorder.start();
    setRecordingSeconds(0);
    setStatus("录音中");
    setMessage("录音中，请朗读左侧英文句子。");
    timerRef.current = window.setInterval(() => setRecordingSeconds((value) => value + 1), 1000);
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    if (timerRef.current) window.clearInterval(timerRef.current);
    setMessage("录音已停止，可以提交评测。");
  }

  function onUpload(file: File | undefined) {
    if (!file) return;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(file);
    setAudioUrl(URL.createObjectURL(file));
    setAudioSource("本地上传");
    setRecordingSeconds(0);
    setStatus("待提交");
    setMessage(`已选择音频：${file.name}`);
  }

  async function submitEvaluation() {
    if (!activeText) return setMessage("请先输入英文测试句子。");
    if (!audioBlob) return setMessage("请先录音或上传音频。");
    setStatus("评测中");
    setMessage("正在提交语音评测...");
    const form = new FormData();
    form.append("text", activeText);
    form.append("source", audioSource === "本地上传" ? "upload" : "browser");
    form.append("audio", audioBlob, audioSource === "本地上传" && audioBlob instanceof File ? audioBlob.name : "browser-recording.webm");
    try {
      const response = await fetch("/api/evaluate", { method: "POST", body: form });
      if (!response.ok) throw new Error((await response.json()).message || "评测失败");
      const data = await response.json() as EvaluationResult;
      setResult(data);
      setStatus("评测完成");
      setMessage("评测完成，可查看右侧结果。");
    } catch (error) {
      setStatus("评测失败");
      setMessage(error instanceof Error ? error.message : "评测失败");
    }
  }

  function clearAll() {
    setResult(null);
    setMessage("");
    setStatus("待录音");
    setAudioSource("未选择");
    setRecordingSeconds(0);
    setAudioBlob(null);
    setAudioUrl("");
    setTtsMs(null);
  }

  return (
    <main className="page">
      <header className="hero">
        <div><p className="eyebrow">Speech Evaluation Mock Demo</p><h1>AI 英语跟读评测 Demo</h1><p>标准朗读、浏览器录音、本地上传、AI 评分、ASR 转写与错词建议一页完成。</p></div>
        <span className="badge">Mock 可离线演示</span>
      </header>

      <section className="layout">
        <aside className="card controls">
          <h2>操作区</h2>
          <label>英文测试句子</label>
          <textarea value={text} onChange={(event) => setText(event.target.value)} rows={6} />
          <label>句子选择</label>
          <select value={selectedId} onChange={(event) => chooseSentence(event.target.value)}>
            {sentences.map((item) => <option key={item.id} value={item.id}>{item.text}（{item.level}）</option>)}
          </select>
          <label>本地音频文件上传</label>
          <input type="file" accept=".wav,.mp3,.webm,.m4a,audio/*" onChange={(event) => onUpload(event.target.files?.[0])} />

          <div className="button-grid">
            <button onClick={playStandardVoice}>播放标准读音</button>
            <button onClick={startRecording} disabled={status === "录音中"}>开始录音</button>
            <button onClick={stopRecording} disabled={status !== "录音中"}>停止录音</button>
            <button className="primary" onClick={submitEvaluation} disabled={status === "评测中"}>提交评测</button>
            <button className="ghost" onClick={clearAll}>清空结果</button>
          </div>

          <div className="status-grid">
            <div><span>音频来源</span><strong>{audioSource}</strong></div>
            <div><span>录音时长</span><strong>{recordingSeconds}s</strong></div>
            <div><span>当前状态</span><strong>{status}</strong></div>
          </div>
          {message && <p className="message">{message}</p>}

          <div className="players">
            <div><span>标准读音播放器</span><audio controls src={standardAudioUrl} /></div>
            <div><span>待评测音频播放器</span><audio controls src={audioUrl} /></div>
          </div>
        </aside>

        <section className="card results">
          <h2>评测结果区</h2>
          {result ? (
            <>
              <div className="total-score"><span>总分</span><strong>{result.scores.total.toFixed(1)}</strong><em>{result.status} · {result.provider}</em></div>
              <div className="score-list">
                <ScoreBar label="准确度" value={result.scores.accuracy} />
                <ScoreBar label="流利度" value={result.scores.fluency} />
                <ScoreBar label="完整度" value={result.scores.integrity} />
                <ScoreBar label="清晰度" value={result.scores.clarity} />
              </div>
              <div className="info-grid">
                <div><span>ASR 转写文本</span><strong>{result.asrText}</strong></div>
                <div><span>评测状态</span><strong>{status}</strong></div>
                <div><span>TTS 耗时</span><strong>{ttsMs ?? 0} ms</strong></div>
                <div><span>上传耗时</span><strong>{result.timing.uploadMs} ms</strong></div>
                <div><span>评测耗时</span><strong>{result.timing.evaluationMs} ms</strong></div>
                <div><span>总耗时</span><strong>{result.timing.totalMs} ms</strong></div>
              </div>
              <h3>纠错建议</h3>
              <ul className="suggestions">{result.suggestions.map((item) => <li key={item}>{item}</li>)}</ul>
              <h3>单词级结果</h3>
              <div className="word-table">
                <div className="word-head"><span>word</span><span>score</span><span>status</span></div>
                {result.wordScores.map((item, index) => <div className={`word-row ${scoreClass(item.score)}`} key={`${item.word}-${index}`}><span>{item.word}</span><strong>{item.score.toFixed(1)}</strong><em>{item.status}</em></div>)}
              </div>
            </>
          ) : <div className="empty">提交评测后，这里会展示总分、维度评分、ASR 转写、接口耗时和单词级错词结果。</div>}
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
